import { and, eq, inArray, lte } from "drizzle-orm";
import { listings, purchases } from "@/db/schema";
import type { Deps } from "./deps";
import { failPurchaseTx } from "./purchase-failure";

/** An adapter call a rule makes after its transaction has committed. */
type AfterCommit = () => Promise<void>;

/**
 * A time rule: applies, in its own transactions, every status change due at `now` and returns
 * the adapter calls to make afterwards. Every change is a conditional transition, so applying a
 * rule twice, or concurrently with another write, changes nothing the second time.
 */
type ExpiryRule = (deps: Deps, now: Date) => AfterCommit[];

export const RESERVATION_EXPIRED = "reservationen gick ut";

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

/** The time rules in the order they apply. Stories add theirs here (ADR-005). */
export const expiryRules: readonly ExpiryRule[] = [expireReservations];

/**
 * Applies every time rule due at `now` (ADR-005): before each read or change of annonser and
 * köp, from the sweep, and when the demo clock moves. Idempotent: a second call with the same
 * `now` changes no row and writes no statushistorik.
 */
export async function expireDue(deps: Deps, now: Date): Promise<void> {
  const afterCommit = expiryRules.flatMap((rule) => rule(deps, now));
  for (const call of afterCommit) await call();
}
