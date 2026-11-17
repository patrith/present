import type { Db } from "@/db/client";
import { type ListingDto, listingsOfSeller } from "./listings";
import { type PurchaseView, purchasesOfBuyer } from "./purchases";

export type MyCards = { listings: ListingDto[]; purchases: PurchaseView[] };

/** "Mina kort": the user's own annonser and köp; köp codes only after leverans. */
export function getMyCards(db: Db, userId: number): MyCards {
  return { listings: listingsOfSeller(db, userId), purchases: purchasesOfBuyer(db, userId) };
}
