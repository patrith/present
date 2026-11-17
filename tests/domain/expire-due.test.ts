import { count } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { statusHistory } from "@/db/schema";
import { expireDue } from "@/domain/expire-due";
import { searchListings } from "@/domain/listings";
import { approvePayment, receivePaymentAnswer, startPurchase } from "@/domain/purchases";
import { transition } from "@/domain/transition";
import { historyOf, listingRow, makeTestDeps, publishNk, purchaseRow, type TestDeps, userId } from "../helpers";

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
