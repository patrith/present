import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { type ListingStatus, type PurchaseStatus, statusHistory, users } from "@/db/schema";
import { listingStatusLabel, purchaseStatusLabel } from "./status";

/** One statushistorik row: tidpunkt, aktör, orsak and the status it led to (Swedish name). */
export type StatusHistoryRow = { at: Date; actor: string; reason: string; status: string };

type EntityType = "listing" | "purchase";

function actorName(actor: { firstName: string; lastName: string; role: string } | undefined): string {
  if (!actor) return "system";
  return actor.role === "admin" ? "demoadministratören" : `${actor.firstName} ${actor.lastName}`;
}

function statusName(entityType: EntityType, status: string): string {
  return entityType === "listing"
    ? listingStatusLabel[status as ListingStatus]
    : purchaseStatusLabel[status as PurchaseStatus];
}

/**
 * The statushistorik of the given annonser or köp, oldest first, keyed by entity id. The single
 * reader of statushistorik for views: callers decide who may see it.
 */
export function statusHistoryOf(db: Db, entityType: EntityType, entityIds: number[]): Map<number, StatusHistoryRow[]> {
  const byEntity = new Map<number, StatusHistoryRow[]>(entityIds.map((id) => [id, []]));
  if (entityIds.length === 0) return byEntity;
  const rows = db
    .select({
      entityId: statusHistory.entityId,
      at: statusHistory.at,
      reason: statusHistory.reason,
      toStatus: statusHistory.toStatus,
      actorFirst: users.firstName,
      actorLast: users.lastName,
      actorRole: users.role,
    })
    .from(statusHistory)
    .leftJoin(users, eq(users.id, statusHistory.actorUserId))
    .where(and(eq(statusHistory.entityType, entityType), inArray(statusHistory.entityId, entityIds)))
    .orderBy(asc(statusHistory.id))
    .all();
  for (const h of rows) {
    byEntity.get(h.entityId)!.push({
      at: h.at,
      reason: h.reason,
      status: statusName(entityType, h.toStatus),
      actor: actorName(h.actorRole ? { firstName: h.actorFirst!, lastName: h.actorLast!, role: h.actorRole } : undefined),
    });
  }
  return byEntity;
}

/** A statushistorik row as its owner sees it: tidpunkt, status and orsak, not the aktör. */
export type OwnerHistoryRow = Omit<StatusHistoryRow, "actor">;

/** One annons's or köp's statushistorik for its owner; the caller has checked ownership. */
export function ownerHistory(db: Db, entityType: EntityType, entityId: number): OwnerHistoryRow[] {
  return statusHistoryOf(db, entityType, [entityId])
    .get(entityId)!
    .map(({ at, status, reason }) => ({ at, status, reason }));
}
