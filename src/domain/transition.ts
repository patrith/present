import { and, eq, isNull, type SQL } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  listings,
  purchases,
  statusHistory,
  type ListingStatus,
  type PurchaseStatus,
} from "@/db/schema";
import { DomainError } from "./errors";

/** A database handle or an open transaction: `transition` joins the caller's transaction. */
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

type Entity = "listing" | "purchase";
type StatusOf<E extends Entity> = E extends "listing" ? ListingStatus : PurchaseStatus;
type RowOf<E extends Entity> = E extends "listing"
  ? typeof listings.$inferInsert
  : typeof purchases.$inferInsert;

/**
 * Every allowed status change (ADR-003). `null` as from means creation.
 * Stories add their rows here; nothing else writes a status.
 */
export const allowedTransitions: { [E in Entity]: ReadonlyArray<readonly [StatusOf<E> | null, StatusOf<E>]> } = {
  listing: [
    [null, "active"],
    ["active", "reserved"],
    ["reserved", "sold"],
    // FR3: the säljare's edit (pris, code, saldo), rättning of a Flaggad annons, återkallelse.
    ["active", "active"],
    ["flagged", "active"],
    ["active", "withdrawn"],
    ["flagged", "withdrawn"],
    // FR5: a failed köp or a lapsed reservation releases the annons; a failing butikskontroll at köp flags it.
    ["reserved", "active"],
    ["reserved", "flagged"],
  ],
  purchase: [
    [null, "started"],
    ["started", "authorized"],
    ["authorized", "delivered"],
    ["started", "failed"],
    ["authorized", "failed"],
    // S06 – FR6/FR7: avslut (bekräftelse, reklamationsperiodens utgång, avslagen tvist), reklamation, återbetalning.
    ["delivered", "completed"],
    ["delivered", "disputed"],
    ["disputed", "refunded"],
    ["disputed", "completed"],
  ],
};

type TransitionArgs<E extends Entity> = {
  entity: E;
  to: StatusOf<E>;
  /** The acting user; null means the system. */
  actorUserId: number | null;
  reason: string;
  at: Date;
} & (
  | {
      /** Creation: `values` is the new row, minus status. */
      from: null;
      id?: undefined;
      values: Omit<RowOf<E>, "status" | "id">;
    }
  | {
      from: StatusOf<E>;
      id: number;
      /** Columns written together with the status. */
      set?: Partial<Omit<RowOf<E>, "status" | "id">>;
      /** Extra column conditions the row must meet besides its prior status. */
      guard?: Partial<Omit<RowOf<E>, "status" | "id">>;
      /** A further SQL condition on the row, for checks equality cannot express. */
      condition?: SQL;
    }
);

function tableOf(entity: Entity) {
  return entity === "listing" ? listings : purchases;
}

function isAllowed<E extends Entity>(entity: E, from: StatusOf<E> | null, to: StatusOf<E>): boolean {
  return (allowedTransitions[entity] as ReadonlyArray<readonly [string | null, string]>).some(
    ([f, t]) => f === from && t === to,
  );
}

/**
 * Changes the status of one annons or köp: a conditional UPDATE on the prior status that must
 * affect exactly one row, plus its statushistorik row, in one transaction (ADR-003).
 * Returns the row id. Throws DomainError when the pair is not allowed or the row is no longer
 * in `from` (a repeat changes nothing).
 */
export function transition<E extends Entity>(db: DbOrTx, args: TransitionArgs<E>): number {
  const { entity, from, to } = args;
  if (!isAllowed(entity, from, to)) {
    throw new DomainError("transition_not_allowed", `Statusändringen ${from ?? "ny"} → ${to} är inte tillåten.`);
  }
  const table = tableOf(entity);
  // Generic discriminants do not narrow; the public signature above keeps callers typed.
  const a = args as unknown as
    | { from: null; values: Record<string, unknown> }
    | {
        from: string;
        id: number;
        set?: Record<string, unknown>;
        guard?: Record<string, unknown>;
        condition?: SQL;
      };

  return db.transaction((tx) => {
    let id: number;
    if (a.from === null) {
      const row = tx
        .insert(table)
        .values({ ...a.values, status: to } as never)
        .returning({ id: table.id })
        .get();
      id = row.id;
    } else {
      const conditions: SQL[] = [eq(table.id, a.id), eq(table.status, a.from as never)];
      for (const [key, value] of Object.entries(a.guard ?? {})) {
        const column = (table as unknown as Record<string, Parameters<typeof eq>[0]>)[key];
        conditions.push(value === null ? isNull(column) : eq(column, value));
      }
      if (a.condition) conditions.push(a.condition);
      const result = tx
        .update(table)
        .set({ ...a.set, status: to } as never)
        .where(and(...conditions))
        .run();
      if (result.changes !== 1) {
        throw new DomainError("transition_conflict", "Statusen har redan ändrats.");
      }
      id = a.id;
    }
    tx.insert(statusHistory)
      .values({
        entityType: entity,
        entityId: id,
        at: args.at,
        fromStatus: from,
        toStatus: to,
        actorUserId: args.actorUserId,
        reason: args.reason,
      })
      .run();
    return id;
  });
}
