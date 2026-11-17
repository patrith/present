import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { listings, users } from "@/db/schema";
import { isDomainError } from "./errors";
import { transition } from "./transition";

type CompletingPurchase = { id: number; listingId: number; amount: number };

/** How a köp reaches Avslutat: the köpare's bekräftelse, the lapsed reklamationsperiod, or a rejected tvist. */
export type CompletionCause = {
  from: "delivered" | "disputed";
  /** The acting user; null means the system. */
  actorUserId: number | null;
  reason: string;
  /** Set when the demoadministratör's "avslå" completes a tvist. */
  adminDecision?: "reject";
};

/**
 * Avslut (FR6): the köp → Avslutat and the annons's säljare credited with the köp's belopp, in one
 * transaction. The only write to the utbetalningssaldo: it runs only when the transition changed
 * one row, so a repeated or concurrent avslut credits nothing (ADR-003). Returns false and changes
 * nothing when the köp has already left `from`.
 */
export function completePurchaseTx(db: Db, purchase: CompletingPurchase, cause: CompletionCause, at: Date): boolean {
  try {
    db.transaction((tx) => {
      transition(tx, {
        entity: "purchase",
        id: purchase.id,
        from: cause.from,
        to: "completed",
        actorUserId: cause.actorUserId,
        reason: cause.reason,
        at,
        set: cause.adminDecision ? { adminDecision: cause.adminDecision } : undefined,
      });
      const { sellerId } = tx
        .select({ sellerId: listings.sellerId })
        .from(listings)
        .where(eq(listings.id, purchase.listingId))
        .get()!;
      tx.update(users)
        .set({ payoutBalance: sql`${users.payoutBalance} + ${purchase.amount}` })
        .where(eq(users.id, sellerId))
        .run();
    });
    return true;
  } catch (e) {
    if (isDomainError(e) && e.code === "transition_conflict") return false;
    throw e;
  }
}
