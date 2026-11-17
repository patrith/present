import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { statusHistory, users } from "@/db/schema";
import { type ListingDto, listingsOfSeller } from "./listings";
import { type PurchaseView, purchasesOfBuyer } from "./purchases";

/**
 * A säljare's own annons: a Flaggad one carries its flaggningsorsak (`flagReason`), an Utgången
 * one why it went out (FR8).
 */
export type MyListing = ListingDto & { expiryReason: string | null };

export type MyCards = {
  /** Newest first, in every status. */
  listings: MyListing[];
  /** Newest first, in every status; the presentkortskod only where the köpare is entitled to it. */
  purchases: PurchaseView[];
  /** The säljare's utbetalningssaldo (simulated), in kronor. */
  payoutBalance: number;
};

/** "Mina kort"'s empty states: what to say and where to go when a list is empty. */
export const MY_CARDS_EMPTY = {
  listings: { text: "Du har inga annonser.", linkText: "Publicera ett kort", href: "/salj" },
  purchases: { text: "Du har inte köpt några kort.", linkText: "Sök erbjudanden", href: "/erbjudanden" },
} as const;

/** The orsak of the latest statushistorik row that made each annons Utgången, in one query. */
function expiryReasonsOf(db: Db, listingIds: number[]): Map<number, string> {
  const reasons = new Map<number, string>();
  if (listingIds.length === 0) return reasons;
  const rows = db
    .select({ listingId: statusHistory.entityId, reason: statusHistory.reason })
    .from(statusHistory)
    .where(
      and(
        eq(statusHistory.entityType, "listing"),
        inArray(statusHistory.entityId, listingIds),
        eq(statusHistory.toStatus, "expired"),
      ),
    )
    .orderBy(asc(statusHistory.id))
    .all();
  for (const row of rows) reasons.set(row.listingId, row.reason);
  return reasons;
}

/** "Mina kort": the user's own annonser and köp, and their utbetalningssaldo; köp codes only after leverans. */
export function getMyCards(db: Db, userId: number): MyCards {
  const own = listingsOfSeller(db, userId);
  const expiryReasons = expiryReasonsOf(
    db,
    own.filter((l) => l.status === "expired").map((l) => l.id),
  );
  const listings = own.map((l) => ({ ...l, expiryReason: expiryReasons.get(l.id) ?? null }));
  const payoutBalance = db.select({ b: users.payoutBalance }).from(users).where(eq(users.id, userId)).get()?.b ?? 0;
  return { listings, purchases: purchasesOfBuyer(db, userId), payoutBalance };
}
