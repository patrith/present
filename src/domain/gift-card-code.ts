import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { listings, purchases } from "@/db/schema";

/** Purchase statuses after leverans in which the köpare may see the presentkortskod. */
const BUYER_CODE_STATUSES = ["delivered"] as const;

/**
 * The single function that returns a presentkortskod. The viewer must be the annons's säljare,
 * or the köpare of a köp of it at Levererat. Everyone else gets undefined.
 */
export function giftCardCodeFor(db: Db, viewerId: number, listingId: number): string | undefined {
  const listing = db
    .select({ sellerId: listings.sellerId, code: listings.giftCardCode })
    .from(listings)
    .where(eq(listings.id, listingId))
    .get();
  if (!listing) return undefined;
  if (listing.sellerId === viewerId) return listing.code;
  const delivered = db
    .select({ id: purchases.id })
    .from(purchases)
    .where(
      and(
        eq(purchases.listingId, listingId),
        eq(purchases.buyerId, viewerId),
        inArray(purchases.status, [...BUYER_CODE_STATUSES]),
      ),
    )
    .get();
  return delivered ? listing.code : undefined;
}

/**
 * Server-internal: the code the butikskontroll is asked about at köp. Its result never leaves
 * the server; only giftCardCodeFor returns a code to a viewer.
 */
export function giftCardCodeForVerification(db: Db, listingId: number): string {
  const row = db.select({ code: listings.giftCardCode }).from(listings).where(eq(listings.id, listingId)).get();
  if (!row) throw new Error(`listing ${listingId} not found`);
  return row.code;
}
