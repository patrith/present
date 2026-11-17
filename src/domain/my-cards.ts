import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { users } from "@/db/schema";
import { type ListingDto, listingsOfSeller } from "./listings";
import { type PurchaseView, purchasesOfBuyer } from "./purchases";

export type MyCards = {
  listings: ListingDto[];
  purchases: PurchaseView[];
  /** The säljare's utbetalningssaldo (simulated), in kronor. */
  payoutBalance: number;
};

/** "Mina kort": the user's own annonser and köp, and their utbetalningssaldo; köp codes only after leverans. */
export function getMyCards(db: Db, userId: number): MyCards {
  const payoutBalance = db.select({ b: users.payoutBalance }).from(users).where(eq(users.id, userId)).get()?.b ?? 0;
  return { listings: listingsOfSeller(db, userId), purchases: purchasesOfBuyer(db, userId), payoutBalance };
}
