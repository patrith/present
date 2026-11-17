import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { statusHistory, users } from "@/db/schema";
import { type ListingDto, listingsOfSeller } from "./listings";
import { type PurchaseView, purchasesOfBuyer } from "./purchases";

/** A säljare's own annons; an Utgången one carries why it went out (FR8). */
export type MyListing = ListingDto & { expiryReason: string | null };

export type MyCards = {
  listings: MyListing[];
  purchases: PurchaseView[];
  /** The säljare's utbetalningssaldo (simulated), in kronor. */
  payoutBalance: number;
};

/** The orsak of the statushistorik row that made the annons Utgången. */
function expiryReasonOf(db: Db, listingId: number): string | null {
  const row = db
    .select({ reason: statusHistory.reason })
    .from(statusHistory)
    .where(
      and(
        eq(statusHistory.entityType, "listing"),
        eq(statusHistory.entityId, listingId),
        eq(statusHistory.toStatus, "expired"),
      ),
    )
    .orderBy(desc(statusHistory.id))
    .get();
  return row?.reason ?? null;
}

/** "Mina kort": the user's own annonser and köp, and their utbetalningssaldo; köp codes only after leverans. */
export function getMyCards(db: Db, userId: number): MyCards {
  const listings = listingsOfSeller(db, userId).map((l) => ({
    ...l,
    expiryReason: l.status === "expired" ? expiryReasonOf(db, l.id) : null,
  }));
  const payoutBalance = db.select({ b: users.payoutBalance }).from(users).where(eq(users.id, userId)).get()?.b ?? 0;
  return { listings, purchases: purchasesOfBuyer(db, userId), payoutBalance };
}
