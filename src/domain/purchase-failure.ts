import type { Db } from "@/db/client";
import { isDomainError } from "./errors";
import { transition } from "./transition";

/** Why a köp failed and where its annons goes. */
export type FailureCause = {
  /** The köp's orsak, also the reason in both statushistorik rows unless flagged. */
  reason: string;
  /** The acting user; null means the system. */
  actorUserId: number | null;
  listingTo: "active" | "flagged";
  /** Flaggningsorsak, required when the annons becomes Flaggad. */
  flagReason?: string;
};

type FailingPurchase = { id: number; listingId: number; buyerId: number };

/**
 * The failure pair (ADR-003): köp `from` → Misslyckat and its annons Reserverad → Aktiv or
 * Flaggad, in one transaction. Returns false and changes nothing when either has already left
 * its prior status (a concurrent leverans, expiry or repeated besked got there first).
 * Adapter calls (void) belong to the caller, after this returns.
 */
export function failPurchaseTx(
  db: Db,
  purchase: FailingPurchase,
  from: "started" | "authorized",
  cause: FailureCause,
  at: Date,
): boolean {
  try {
    db.transaction((tx) => {
      transition(tx, {
        entity: "purchase",
        id: purchase.id,
        from,
        to: "failed",
        actorUserId: cause.actorUserId,
        reason: cause.reason,
        at,
        set: { failureReason: cause.reason },
      });
      transition(tx, {
        entity: "listing",
        id: purchase.listingId,
        from: "reserved",
        to: cause.listingTo,
        actorUserId: cause.actorUserId,
        reason: cause.listingTo === "flagged" ? cause.flagReason! : cause.reason,
        at,
        guard: { reservedById: purchase.buyerId },
        set: { reservedById: null, reservedUntil: null, flagReason: cause.flagReason ?? null },
      });
    });
    return true;
  } catch (e) {
    if (isDomainError(e) && e.code === "transition_conflict") return false;
    throw e;
  }
}
