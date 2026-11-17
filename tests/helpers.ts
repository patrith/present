import { and, asc, count, eq } from "drizzle-orm";
import { SimulatedGiftCardVerifier, type VerificationRequest } from "@/adapters/gift-card-verifier";
import { SimulatedPaymentProvider } from "@/adapters/payment-provider";
import { SimulatedSmsSender } from "@/adapters/sms";
import { createTestDb, type Db } from "@/db/client";
import { listings, purchases, statusHistory, users, type ListingStatus } from "@/db/schema";
import { seed } from "@/db/seed";
import { FixedClock } from "@/domain/clock";
import { loadConfig } from "@/domain/config";
import type { Deps } from "@/domain/deps";
import { publishListing } from "@/domain/listings";
import { transition } from "@/domain/transition";

export type TestDeps = Deps & { clock: FixedClock; payments: SimulatedPaymentProvider };

/** A fresh in-memory database seeded like demo start, with a fixed clock and simulators. */
export function makeTestDeps(): TestDeps {
  const db = createTestDb();
  const clock = new FixedClock();
  seed(db, clock);
  return {
    db,
    clock,
    config: loadConfig({}),
    sms: new SimulatedSmsSender(db, clock),
    verifier: new SimulatedGiftCardVerifier(),
    payments: new SimulatedPaymentProvider(),
  };
}

export function userId(db: Db, firstName: "Sara" | "Kalle" | "Lisa" | "Demo"): number {
  return db.select({ id: users.id }).from(users).where(eq(users.firstName, firstName)).get()!.id;
}

/** Sara's NK annons from the demo flow: saldo 1 000 kr, pris 850 kr, valid a year ahead. */
export function publishNk(deps: Deps, code = "NK-4471-9920"): Promise<number> {
  return publishListing(deps, userId(deps.db, "Sara"), {
    merchantId: "NK",
    giftCardCode: code,
    balance: 1000,
    price: 850,
    validUntil: "2027-11-17",
  });
}

/** Wraps the deps' verifier so a test can count butikskontroll calls. */
export function spyOnVerifier(deps: Deps): { calls: VerificationRequest[] } {
  const inner = deps.verifier;
  const spy = { calls: [] as VerificationRequest[] };
  deps.verifier = {
    verify: (request) => {
      spy.calls.push(request);
      return inner.verify(request);
    },
  };
  return spy;
}

export function listingRow(db: Db, id: number) {
  return db.select().from(listings).where(eq(listings.id, id)).get()!;
}

export function listingHistory(db: Db, id: number) {
  return historyOf({ db }, "listing", id);
}

/**
 * Test fixture: forces an annons into a status this story's own paths do not reach (Flaggad from
 * a köp, Utgången, Såld), written straight to the row.
 */
export function forceListingStatus(
  db: Db,
  id: number,
  status: ListingStatus,
  set: Partial<typeof listings.$inferInsert> = {},
): void {
  db.update(listings).set({ ...set, status }).where(eq(listings.id, id)).run();
}

export function purchaseRow(deps: Deps, id: number) {
  return deps.db.select().from(purchases).where(eq(purchases.id, id)).get()!;
}

/** Statushistorik of one annons or köp, oldest first. */
export function historyOf(deps: Pick<Deps, "db">, entityType: "listing" | "purchase", id: number) {
  return deps.db
    .select()
    .from(statusHistory)
    .where(and(eq(statusHistory.entityType, entityType), eq(statusHistory.entityId, id)))
    .orderBy(asc(statusHistory.id))
    .all();
}

/** Statushistorik rows across every annons and köp. */
export function historyCount(deps: Pick<Deps, "db">): number {
  return deps.db.select({ n: count() }).from(statusHistory).get()!.n;
}

/**
 * Betalning auktoriserad (850 kr) on a Påbörjat köp, written as the köp flow would while the
 * butikskontroll is still out; returns the authorizationId.
 */
export async function authorizeDirectly(deps: TestDeps, purchaseId: number): Promise<string> {
  const besked = await deps.payments.authorize({ amount: 850, approve: true });
  if (besked.outcome !== "authorized") throw new Error("expected an authorization");
  transition(deps.db, {
    entity: "purchase",
    id: purchaseId,
    from: "started",
    to: "authorized",
    actorUserId: null,
    reason: "betalning auktoriserad (simulerat)",
    at: deps.clock.now(),
    set: { authorizationId: besked.authorizationId },
  });
  return besked.authorizationId;
}
