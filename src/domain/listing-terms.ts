import type { ListingStatus } from "@/db/schema";
import { endOfValidity } from "./dates";

const SHORT_VALIDITY_MS = 7 * 24 * 60 * 60 * 1000;

/** Kontrollstatus as the köpare sees it: flagged by the butikskontroll, else kontrollerad. */
export type CheckStatus = "verified" | "flagged";

/** What a köpare compares an annons on, computed from its stored saldo, pris and giltighetsdatum. */
export type ListingTerms = {
  /** Rabatt in kronor: saldo − pris. */
  discountKr: number;
  /** Rabatt in whole procent of saldo, rounded half up (display only; sorting uses the exact ratio). */
  discountPct: number;
  /** Less than 7 × 24 h from now to the end of giltighetsdatum, Swedish time. */
  shortValidity: boolean;
  checkStatus: CheckStatus;
};

type TermsInput = { balance: number; price: number; validUntil: string; status: ListingStatus };

/** The one place rabatt and the short-giltighet warning are computed (`now` comes from the Clock). */
export function listingTerms(listing: TermsInput, now: Date): ListingTerms {
  const discountKr = listing.balance - listing.price;
  return {
    discountKr,
    // round(100 · rabatt / saldo) half up, in integers so 0.5 never drifts.
    discountPct: Math.floor((200 * discountKr + listing.balance) / (2 * listing.balance)),
    shortValidity: endOfValidity(listing.validUntil).getTime() - now.getTime() < SHORT_VALIDITY_MS,
    checkStatus: listing.status === "flagged" ? "flagged" : "verified",
  };
}

/** Orders two annonser by exact rabatt ratio, highest first, without floating-point division. */
export function compareDiscountDesc(
  a: { balance: number; price: number },
  b: { balance: number; price: number },
): number {
  return (b.balance - b.price) * a.balance - (a.balance - a.price) * b.balance;
}
