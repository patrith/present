import { type ListingStatus, listings } from "@/db/schema";
import type { Deps } from "@/domain/deps";

/** Removes the seeded annonser so a test controls every annons sökningen can see. */
export function clearListings(deps: Deps): void {
  deps.db.delete(listings).run();
}

let codeSeq = 0;

/** Stores an annons directly, with the given status and publication time (default: the clock's now). */
export function addListing(
  deps: Deps,
  sellerId: number,
  l: {
    merchantId: string;
    balance: number;
    price: number;
    validUntil?: string;
    status?: ListingStatus;
    publishedAt?: Date;
  },
): number {
  return deps.db
    .insert(listings)
    .values({
      sellerId,
      merchantId: l.merchantId,
      giftCardCode: `TEST-${++codeSeq}`,
      balance: l.balance,
      price: l.price,
      validUntil: l.validUntil ?? "2027-11-17",
      status: l.status ?? "active",
      createdAt: l.publishedAt ?? deps.clock.now(),
    })
    .returning({ id: listings.id })
    .get().id;
}
