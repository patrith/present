import { and, eq, inArray, lte } from "drizzle-orm";
import { listings, purchases } from "@/db/schema";
import { endOfValidity, isPastValidity, stockholmDate } from "./dates";
import type { Deps } from "./deps";
import { isDomainError } from "./errors";
import { failPurchaseTx } from "./purchase-failure";
import { transition } from "./transition";

/** An adapter call a rule makes after its transaction has committed. */
type AfterCommit = () => Promise<void>;

/**
 * A time rule: applies, in its own transactions, every status change due at `now` and returns
 * the adapter calls to make afterwards. Every change is a conditional transition, so applying a
 * rule twice, or concurrently with another write, changes nothing the second time.
 */
type ExpiryRule = (deps: Deps, now: Date) => AfterCommit[];

const RESERVATION_EXPIRED = "reservationen gick ut";

/**
 * A Reserverad annons whose reservation has run out (`reserved_until` ≤ now) before leverans:
 * its Påbörjat or Betalning auktoriserad köp fails, the annons is Aktiv again, and any
 * authorization is released after commit.
 */
function expireReservations(deps: Deps, now: Date): AfterCommit[] {
  const due = deps.db
    .select({
      id: purchases.id,
      listingId: purchases.listingId,
      buyerId: purchases.buyerId,
      status: purchases.status,
      authorizationId: purchases.authorizationId,
    })
    .from(purchases)
    .innerJoin(listings, and(eq(listings.id, purchases.listingId), eq(listings.reservedById, purchases.buyerId)))
    .where(
      and(
        eq(listings.status, "reserved"),
        lte(listings.reservedUntil, now),
        inArray(purchases.status, ["started", "authorized"]),
      ),
    )
    .all();

  const afterCommit: AfterCommit[] = [];
  for (const p of due) {
    const failed = failPurchaseTx(
      deps.db,
      p,
      p.status as "started" | "authorized",
      { reason: RESERVATION_EXPIRED, actorUserId: null, listingTo: "active" },
      now,
    );
    const authorizationId = p.authorizationId;
    if (failed && authorizationId) afterCommit.push(() => deps.payments.void(authorizationId));
  }
  return afterCommit;
}

// S07 – FR8: utgång av annonser. ---------------------------------------------------------------

const CARD_EXPIRED = "kortet har gått ut";

/** The annons's expiry orsak, also the säljare's explanation in "mina kort". */
export function validityPassedReason(validUntil: string): string {
  return `giltighetsdatumet ${validUntil} har passerat`;
}

/**
 * A Reserverad annons whose giltighet ended before leverans and before its reservation ran out:
 * its Påbörjat or Betalning auktoriserad köp fails as "kortet har gått ut", the annons is
 * Utgången, and any authorization is released after commit. Runs before the reservation rule,
 * so that when both deadlines have passed the earlier one decides the köp's orsak; when the
 * reservation ran out first, that rule frees the annons and `expirePastValidity` expires it.
 */
function expireReservedPastValidity(deps: Deps, now: Date): AfterCommit[] {
  const candidates = deps.db
    .select({
      id: purchases.id,
      listingId: purchases.listingId,
      buyerId: purchases.buyerId,
      status: purchases.status,
      authorizationId: purchases.authorizationId,
      validUntil: listings.validUntil,
      reservedUntil: listings.reservedUntil,
    })
    .from(purchases)
    .innerJoin(listings, and(eq(listings.id, purchases.listingId), eq(listings.reservedById, purchases.buyerId)))
    .where(
      and(
        eq(listings.status, "reserved"),
        // A cheap superset (dates up to today in Sweden); isPastValidity decides.
        lte(listings.validUntil, stockholmDate(now)),
        inArray(purchases.status, ["started", "authorized"]),
      ),
    )
    .all();

  const afterCommit: AfterCommit[] = [];
  for (const p of candidates) {
    if (!isPastValidity(p.validUntil, now)) continue;
    // The reservation ran out strictly first: the reservation rule's orsak applies.
    if (p.reservedUntil && p.reservedUntil.getTime() < endOfValidity(p.validUntil).getTime()) continue;
    const failed = failPurchaseTx(
      deps.db,
      p,
      p.status as "started" | "authorized",
      {
        reason: CARD_EXPIRED,
        actorUserId: null,
        listingTo: "expired",
        listingReason: validityPassedReason(p.validUntil),
      },
      now,
    );
    const authorizationId = p.authorizationId;
    if (failed && authorizationId) afterCommit.push(() => deps.payments.void(authorizationId));
  }
  return afterCommit;
}

/** An Aktiv or Flaggad annons whose giltighet has ended becomes Utgången (aktör system). */
function expirePastValidity(deps: Deps, now: Date): AfterCommit[] {
  const candidates = deps.db
    .select({ id: listings.id, status: listings.status, validUntil: listings.validUntil })
    .from(listings)
    .where(and(inArray(listings.status, ["active", "flagged"]), lte(listings.validUntil, stockholmDate(now))))
    .all();
  for (const listing of candidates) {
    if (!isPastValidity(listing.validUntil, now)) continue;
    try {
      transition(deps.db, {
        entity: "listing",
        id: listing.id,
        from: listing.status as "active" | "flagged",
        to: "expired",
        actorUserId: null,
        reason: validityPassedReason(listing.validUntil),
        at: now,
      });
    } catch (e) {
      // A concurrent change (reservation, edit, återkallelse) got there first.
      if (!(isDomainError(e) && e.code === "transition_conflict")) throw e;
    }
  }
  return [];
}

// ------------------------------------------------------------------------------------------------

/** The time rules in the order they apply. Stories add theirs here (ADR-005). */
export const expiryRules: readonly ExpiryRule[] = [
  // S07: before the reservation rule, so the earlier of the two deadlines decides the orsak.
  expireReservedPastValidity,
  expireReservations,
  // S07: after it, so an annons the reservation rule just freed expires in the same call.
  expirePastValidity,
];

/**
 * Applies every time rule due at `now` (ADR-005): before each read or change of annonser and
 * köp, from the sweep, and when the demo clock moves. Idempotent: a second call with the same
 * `now` changes no row and writes no statushistorik.
 */
export async function expireDue(deps: Deps, now: Date): Promise<void> {
  const afterCommit = expiryRules.flatMap((rule) => rule(deps, now));
  for (const call of afterCommit) await call();
}
