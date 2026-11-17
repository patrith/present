import { count } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { purchases, statusHistory } from "@/db/schema";
import { expireDue } from "@/domain/expire-due";
import { searchListings } from "@/domain/listings";
import { approvePayment, getPurchaseForBuyer, receivePaymentAnswer, startPurchase } from "@/domain/purchases";
import { transition } from "@/domain/transition";
import {
  forceListingStatus,
  historyOf,
  listingRow,
  makeTestDeps,
  publishNk,
  purchaseRow,
  type TestDeps,
  userId,
} from "../helpers";

function historyCount(deps: TestDeps): number {
  return deps.db.select({ n: count() }).from(statusHistory).get()!.n;
}

/** Kalle's köp of Sara's NK annons, reserved at 12:00 until 12:05; optionally authorized. */
async function reservedPurchase(authorized: boolean) {
  const deps = makeTestDeps();
  const kalle = userId(deps.db, "Kalle");
  const listingId = await publishNk(deps);
  const purchaseId = startPurchase(deps, kalle, listingId);
  let authorizationId: string | undefined;
  if (authorized) {
    const besked = await deps.payments.authorize({ amount: 850, approve: true });
    if (besked.outcome !== "authorized") throw new Error("expected an authorization");
    authorizationId = besked.authorizationId;
    // The köp as it stands while the butikskontroll is still out.
    transition(deps.db, {
      entity: "purchase",
      id: purchaseId,
      from: "started",
      to: "authorized",
      actorUserId: null,
      reason: "betalning auktoriserad (simulerat)",
      at: deps.clock.now(),
      set: { authorizationId },
    });
  }
  return { deps, kalle, listingId, purchaseId, authorizationId };
}

describe("expireDue", () => {
  it("reservation expiry fails purchase reactivates listing and is idempotent", async () => {
    for (const authorized of [false, true]) {
      const { deps, kalle, listingId, purchaseId, authorizationId } = await reservedPurchase(authorized);
      expect(purchaseRow(deps, purchaseId).status).toBe(authorized ? "authorized" : "started");

      // Not yet due at 12:04:59.
      deps.clock.advance(5 * 60_000 - 1_000);
      await expireDue(deps, deps.clock.now());
      expect(listingRow(deps.db, listingId).status).toBe("reserved");

      deps.clock.advance(2_000); // 12:05:01
      await expireDue(deps, deps.clock.now());

      expect(purchaseRow(deps, purchaseId)).toMatchObject({ status: "failed", failureReason: "reservationen gick ut" });
      expect(listingRow(deps.db, listingId)).toMatchObject({ status: "active", reservedById: null, reservedUntil: null });
      expect(searchListings(deps, userId(deps.db, "Lisa")).some((l) => l.id === listingId)).toBe(true);
      expect(historyOf(deps, "purchase", purchaseId).at(-1)).toMatchObject({
        toStatus: "failed",
        actorUserId: null,
        reason: "reservationen gick ut",
      });
      expect(historyOf(deps, "listing", listingId).at(-1)).toMatchObject({
        fromStatus: "reserved",
        toStatus: "active",
        actorUserId: null,
        reason: "reservationen gick ut",
      });
      expect(deps.payments.countIn("voided")).toBe(authorized ? 1 : 0);
      expect(deps.payments.countIn("authorized")).toBe(0);
      if (authorizationId) expect(deps.payments.captureCount(authorizationId)).toBe(0);

      // Idempotent: a second call with the same now changes no row and writes no statushistorik.
      const rows = { purchase: purchaseRow(deps, purchaseId), listing: listingRow(deps.db, listingId) };
      const written = historyCount(deps);
      await expireDue(deps, deps.clock.now());
      expect(purchaseRow(deps, purchaseId)).toEqual(rows.purchase);
      expect(listingRow(deps.db, listingId)).toEqual(rows.listing);
      expect(historyCount(deps)).toBe(written);

      // An approval after expiry keeps no authorization and draws nothing.
      if (!authorized) {
        await expect(approvePayment(deps, kalle, purchaseId)).rejects.toMatchObject({ code: "wrong_purchase_status" });
        expect(deps.payments.countIn("authorized")).toBe(0);
        expect(deps.payments.totalCaptures()).toBe(0);
      }
    }
  });

  it("a besked after the reservation lapsed keeps no authorization", async () => {
    // Expiry not yet applied: the köp is still Påbörjat when the approving besked arrives late.
    const { deps, kalle, listingId, purchaseId } = await reservedPurchase(false);
    deps.clock.advance(5 * 60_000 + 1_000);
    const outcome = await approvePayment(deps, kalle, purchaseId);
    expect(outcome).toEqual({ kind: "unchanged", status: "failed" });
    expect(purchaseRow(deps, purchaseId)).toMatchObject({ status: "failed", failureReason: "reservationen gick ut" });
    expect(listingRow(deps.db, listingId).status).toBe("active");
    expect(deps.payments.countIn("authorized")).toBe(0);
    expect(deps.payments.totalCaptures()).toBe(0);

    // A besked arriving after expireDue already failed the köp is released at once.
    const { deps: d2, purchaseId: p2 } = await reservedPurchase(false);
    d2.clock.advance(5 * 60_000 + 1_000);
    await expireDue(d2, d2.clock.now());
    const late = await d2.payments.authorize({ amount: 850, approve: true });
    expect(await receivePaymentAnswer(d2, p2, late)).toEqual({ kind: "unchanged", status: "failed" });
    expect(d2.payments.countIn("authorized")).toBe(0);
    expect(d2.payments.countIn("voided")).toBe(1);
  });

  // S06
  it("claim period lapse completes and credits once", async () => {
    const { confirmPurchase } = await import("@/domain/purchases");
    const { CLAIM_PERIOD_MS, deliveredPurchase, payoutOf } = await import("../purchases/delivered");
    const { deps, sara, purchaseId } = await deliveredPurchase();

    // 11:59 the next day: still Levererat.
    deps.clock.advance(CLAIM_PERIOD_MS - 60_000);
    await expireDue(deps, deps.clock.now());
    expect(purchaseRow(deps, purchaseId).status).toBe("delivered");
    expect(payoutOf(deps, sara)).toBe(0);

    // A Tvist köp in the same database is never touched.
    const tvist = await deliveredPurchase(deps, "NK-0000-0003");
    transition(deps.db, {
      entity: "purchase",
      id: tvist.purchaseId,
      from: "delivered",
      to: "disputed",
      actorUserId: tvist.kalle,
      reason: "köparen reklamerade",
      at: deps.clock.now(),
    });

    deps.clock.advance(60_000); // 12:00 the next day
    await expireDue(deps, deps.clock.now());
    expect(purchaseRow(deps, purchaseId).status).toBe("completed");
    expect(historyOf(deps, "purchase", purchaseId).at(-1)).toMatchObject({
      toStatus: "completed",
      actorUserId: null,
      reason: "reklamationsperioden löpte ut",
    });
    expect(payoutOf(deps, sara)).toBe(850);

    // Idempotent: a second call with the same now writes nothing.
    const before = historyCount(deps);
    await expireDue(deps, deps.clock.now());
    expect(historyCount(deps)).toBe(before);
    expect(payoutOf(deps, sara)).toBe(850);

    // The Tvist köp, past its own period too, is unchanged and uncredited.
    deps.clock.advance(CLAIM_PERIOD_MS);
    await expireDue(deps, deps.clock.now());
    expect(purchaseRow(deps, tvist.purchaseId).status).toBe("disputed");
    expect(payoutOf(deps, sara)).toBe(850);

    // Confirm racing expireDue at the boundary, 20 rounds: exactly one credit each.
    for (let round = 0; round < 20; round++) {
      const r = await deliveredPurchase(undefined, `NK-RACE-${round}`);
      const at = new Date(r.deps.clock.now().getTime() + CLAIM_PERIOD_MS);
      r.deps.clock.advance(CLAIM_PERIOD_MS);
      const confirm = () => confirmPurchase(r.deps, r.kalle, r.purchaseId);
      const expire = () => expireDue(r.deps, at);
      await Promise.all(round % 2 === 0 ? [confirm(), expire()] : [expire(), confirm()]);
      expect(purchaseRow(r.deps, r.purchaseId).status).toBe("completed");
      expect(historyOf(r.deps, "purchase", r.purchaseId).filter((h) => h.toStatus === "completed")).toHaveLength(1);
      expect(payoutOf(r.deps, r.sara)).toBe(850);
    }
  });
});

// S07 – FR8: utgång av annonser. ---------------------------------------------------------------

const LAST_DAY = "2026-11-17";
const at = (swedishTime: string) => new Date(`${swedishTime}+01:00`);

/** Sara's NK annons with giltighetsdatum 2026-11-17, in the given status. */
async function lastDayListing(deps: TestDeps, status: "active" | "flagged" = "active", code?: string) {
  const listingId = await publishNk(deps, code);
  forceListingStatus(deps.db, listingId, status, {
    validUntil: LAST_DAY,
    flagReason: status === "flagged" ? "saldoavvikelse" : null,
  });
  return listingId;
}

/** Kalle's köp of a last-day annons, started at `start` (Swedish time); optionally authorized. */
async function lastDayPurchase(deps: TestDeps, start: string, authorized: boolean, code?: string) {
  const kalle = userId(deps.db, "Kalle");
  const listingId = await lastDayListing(deps, "active", code);
  deps.clock.advance(at(start).getTime() - deps.clock.now().getTime());
  const purchaseId = startPurchase(deps, kalle, listingId);
  let authorizationId: string | undefined;
  if (authorized) {
    const besked = await deps.payments.authorize({ amount: 850, approve: true });
    if (besked.outcome !== "authorized") throw new Error("expected an authorization");
    authorizationId = besked.authorizationId;
    transition(deps.db, {
      entity: "purchase",
      id: purchaseId,
      from: "started",
      to: "authorized",
      actorUserId: null,
      reason: "betalning auktoriserad (simulerat)",
      at: deps.clock.now(),
      set: { authorizationId },
    });
  }
  return { kalle, listingId, purchaseId, authorizationId };
}

describe("expireDue – giltighet", () => {
  it("active and flagged listings expire after their last day", async () => {
    const deps = makeTestDeps();
    const [kalle, lisa] = [userId(deps.db, "Kalle"), userId(deps.db, "Lisa")];
    const active = await lastDayListing(deps, "active");
    const flagged = await lastDayListing(deps, "flagged", "NK-5555-1234");
    const listed = () => searchListings(deps, kalle).some((l) => l.id === active);

    // 23:59:59 Swedish time on the last day: still Aktiv and listed.
    deps.clock.advance(at("2026-11-17T23:59:59").getTime() - deps.clock.now().getTime());
    await expireDue(deps, deps.clock.now());
    expect(listingRow(deps.db, active).status).toBe("active");
    expect(listingRow(deps.db, flagged).status).toBe("flagged");
    expect(listed()).toBe(true);

    // Midnight: both Utgången, with a system history row naming the passed giltighetsdatum.
    deps.clock.advance(1_000);
    await expireDue(deps, deps.clock.now());
    for (const [id, from] of [
      [active, "active"],
      [flagged, "flagged"],
    ] as const) {
      expect(listingRow(deps.db, id).status).toBe("expired");
      expect(historyOf(deps, "listing", id).at(-1)).toMatchObject({
        fromStatus: from,
        toStatus: "expired",
        actorUserId: null,
        reason: "giltighetsdatumet 2026-11-17 har passerat",
        at: at("2026-11-18T00:00:00"),
      });
    }
    expect(listed()).toBe(false);
    expect(searchListings(deps, lisa).some((l) => l.id === active)).toBe(false);

    // A köp start is refused with story S05's message and creates no köp.
    const purchasesBefore = deps.db.select({ n: count() }).from(purchases).get()!.n;
    expect(() => startPurchase(deps, kalle, active)).toThrow(
      expect.objectContaining({ code: "listing_unavailable" }),
    );
    expect(deps.db.select({ n: count() }).from(purchases).get()!.n).toBe(purchasesBefore);

    // Idempotent: a second call with the same now changes nothing.
    const written = historyCount(deps);
    await expireDue(deps, deps.clock.now());
    expect(historyCount(deps)).toBe(written);
  });

  it("reserved listing past validity fails purchase as card expired", async () => {
    // Scenario S04: reserved 23:58 until 00:03, Påbörjat and Betalning auktoriserad.
    for (const authorized of [false, true]) {
      const deps = makeTestDeps();
      const { kalle, listingId, purchaseId, authorizationId } = await lastDayPurchase(deps, "2026-11-17T23:58:00", authorized);

      deps.clock.advance(at("2026-11-18T00:00:00").getTime() - deps.clock.now().getTime() - 1);
      await expireDue(deps, deps.clock.now());
      expect(listingRow(deps.db, listingId).status).toBe("reserved");

      deps.clock.advance(1);
      await expireDue(deps, deps.clock.now());
      expect(purchaseRow(deps, purchaseId)).toMatchObject({ status: "failed", failureReason: "kortet har gått ut" });
      expect(listingRow(deps.db, listingId)).toMatchObject({ status: "expired", reservedById: null, reservedUntil: null });
      expect(historyOf(deps, "purchase", purchaseId).at(-1)).toMatchObject({
        toStatus: "failed",
        actorUserId: null,
        reason: "kortet har gått ut",
      });
      expect(historyOf(deps, "listing", listingId).at(-1)).toMatchObject({
        fromStatus: "reserved",
        toStatus: "expired",
        actorUserId: null,
        reason: "giltighetsdatumet 2026-11-17 har passerat",
      });
      expect(searchListings(deps, kalle).some((l) => l.id === listingId)).toBe(false);
      expect(deps.payments.countIn("voided")).toBe(authorized ? 1 : 0);
      expect(deps.payments.countIn("authorized")).toBe(0);
      expect(deps.payments.totalCaptures()).toBe(0);
      if (authorizationId) expect(deps.payments.captureCount(authorizationId)).toBe(0);
      const view = getPurchaseForBuyer(deps.db, kalle, purchaseId);
      expect(view).toMatchObject({ status: "failed", failureReason: "kortet har gått ut" });
      expect(view.giftCardCode).toBeUndefined();

      // Idempotent repeat.
      const written = historyCount(deps);
      await expireDue(deps, deps.clock.now());
      expect(historyCount(deps)).toBe(written);
      expect(deps.payments.countIn("voided")).toBe(authorized ? 1 : 0);
    }

    // Scenario S07: both deadlines passed when expireDue first runs at 01:00; the earlier decides.
    const deps = makeTestDeps();
    const lapsed = await lastDayPurchase(deps, "2026-11-17T12:00:00", false);
    const expired = await lastDayPurchase(deps, "2026-11-17T23:58:00", false, "NK-7777-0001");
    deps.clock.advance(at("2026-11-18T01:00:00").getTime() - deps.clock.now().getTime());
    await expireDue(deps, deps.clock.now());
    expect(purchaseRow(deps, lapsed.purchaseId)).toMatchObject({ status: "failed", failureReason: "reservationen gick ut" });
    expect(purchaseRow(deps, expired.purchaseId)).toMatchObject({ status: "failed", failureReason: "kortet har gått ut" });
    expect(listingRow(deps.db, lapsed.listingId).status).toBe("expired");
    expect(listingRow(deps.db, expired.listingId).status).toBe("expired");
    const written = historyCount(deps);
    await expireDue(deps, deps.clock.now());
    expect(historyCount(deps)).toBe(written);
  });
});
