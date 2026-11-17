import { aliasedTable, asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { listings, merchants, purchases, users } from "@/db/schema";
import { DomainError } from "./errors";
import { type StatusHistoryRow, statusHistoryOf } from "./status-history";

/** A tvist as the demoadministratör sees it. Code-free by construction: no column holds the presentkortskod. */
export type DisputeDto = {
  purchaseId: number;
  merchantName: string;
  amount: number;
  buyerName: string;
  sellerName: string;
  claimReason: string;
  /** The köp's statushistorik, aktör included. */
  history: StatusHistoryRow[];
};

const buyers = aliasedTable(users, "buyers");
const sellers = aliasedTable(users, "sellers");

/** Refuses (forbidden, with `message`) anyone but the demoadministratör. */
export function requireAdmin(db: Db, userId: number, message: string): void {
  const user = db.select({ role: users.role }).from(users).where(eq(users.id, userId)).get();
  if (user?.role !== "admin") throw new DomainError("forbidden", message);
}

/** Tvister: every köp in Tvist with its motivering and statushistorik, for the demoadministratör only. */
export function listDisputes(db: Db, viewerId: number): DisputeDto[] {
  requireAdmin(db, viewerId, "Endast demoadministratören kan se tvister.");

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

  const history = statusHistoryOf(db, "purchase", rows.map((r) => r.purchaseId));

  return rows.map((r) => ({
    purchaseId: r.purchaseId,
    merchantName: r.merchantName,
    amount: r.amount,
    buyerName: `${r.buyerFirst} ${r.buyerLast}`,
    sellerName: `${r.sellerFirst} ${r.sellerLast}`,
    claimReason: r.claimReason ?? "",
    history: history.get(r.purchaseId)!,
  }));
}

export const NO_OPEN_DISPUTES = "Inga öppna tvister.";

/** The Tvister page's data: the open tvister, or the empty-state text when there are none. */
export function getDisputesPage(db: Db, viewerId: number): { disputes: DisputeDto[]; emptyText?: string } {
  const disputes = listDisputes(db, viewerId);
  return disputes.length ? { disputes } : { disputes, emptyText: NO_OPEN_DISPUTES };
}
