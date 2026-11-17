import { aliasedTable, and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { listings, merchants, type PurchaseStatus, purchases, statusHistory, users } from "@/db/schema";
import { DomainError } from "./errors";
import { purchaseStatusLabel } from "./status";

/** One statushistorik row: tidpunkt, aktör, orsak and the status it led to (Swedish name). */
export type DisputeHistoryRow = { at: Date; actor: string; reason: string; status: string };

/** A tvist as the demoadministratör sees it. Code-free by construction: no column holds the presentkortskod. */
export type DisputeDto = {
  purchaseId: number;
  merchantName: string;
  amount: number;
  buyerName: string;
  sellerName: string;
  claimReason: string;
  history: DisputeHistoryRow[];
};

const buyers = aliasedTable(users, "buyers");
const sellers = aliasedTable(users, "sellers");

function actorName(actor: { firstName: string; lastName: string; role: string } | undefined): string {
  if (!actor) return "system";
  return actor.role === "admin" ? "demoadministratören" : `${actor.firstName} ${actor.lastName}`;
}

/** Tvister: every köp in Tvist with its motivering and statushistorik, for the demoadministratör only. */
export function listDisputes(db: Db, viewerId: number): DisputeDto[] {
  const viewer = db.select({ role: users.role }).from(users).where(eq(users.id, viewerId)).get();
  if (viewer?.role !== "admin") throw new DomainError("forbidden", "Endast demoadministratören kan se tvister.");

  const rows = db
    .select({
      purchaseId: purchases.id,
      merchantName: merchants.name,
      amount: purchases.amount,
      buyerFirst: buyers.firstName,
      buyerLast: buyers.lastName,
      sellerFirst: sellers.firstName,
      sellerLast: sellers.lastName,
      claimReason: purchases.claimReason,
    })
    .from(purchases)
    .innerJoin(listings, eq(listings.id, purchases.listingId))
    .innerJoin(merchants, eq(merchants.id, listings.merchantId))
    .innerJoin(buyers, eq(buyers.id, purchases.buyerId))
    .innerJoin(sellers, eq(sellers.id, listings.sellerId))
    .where(eq(purchases.status, "disputed"))
    .orderBy(asc(purchases.id))
    .all();
  if (rows.length === 0) return [];

  const history = db
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
    .where(
      and(
        eq(statusHistory.entityType, "purchase"),
        inArray(
          statusHistory.entityId,
          rows.map((r) => r.purchaseId),
        ),
      ),
    )
    .orderBy(asc(statusHistory.id))
    .all();

  return rows.map((r) => ({
    purchaseId: r.purchaseId,
    merchantName: r.merchantName,
    amount: r.amount,
    buyerName: `${r.buyerFirst} ${r.buyerLast}`,
    sellerName: `${r.sellerFirst} ${r.sellerLast}`,
    claimReason: r.claimReason ?? "",
    history: history
      .filter((h) => h.entityId === r.purchaseId)
      .map((h) => ({
        at: h.at,
        reason: h.reason,
        status: purchaseStatusLabel[h.toStatus as PurchaseStatus],
        actor: actorName(h.actorRole ? { firstName: h.actorFirst!, lastName: h.actorLast!, role: h.actorRole } : undefined),
      })),
  }));
}

export const NO_OPEN_DISPUTES = "Inga öppna tvister.";

/** The Tvister page's data: the open tvister, or the empty-state text when there are none. */
export function getDisputesPage(db: Db, viewerId: number): { disputes: DisputeDto[]; emptyText?: string } {
  const disputes = listDisputes(db, viewerId);
  return disputes.length ? { disputes } : { disputes, emptyText: NO_OPEN_DISPUTES };
}
