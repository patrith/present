import { describe, expect, it } from "vitest";
import { expireDue } from "@/domain/expire-due";
import { deliverPurchase, startPurchase } from "@/domain/purchases";
import { transition } from "@/domain/transition";
import { listingRow, makeTestDeps, publishNk, purchaseRow, userId } from "../helpers";

describe("expiry against leverans", () => {
  it("expiry and delivery never both apply", async () => {
    const seen = new Set<string>();
    for (let round = 0; round < 20; round++) {
      const deps = makeTestDeps();
      const kalle = userId(deps.db, "Kalle");
      const listingId = await publishNk(deps);
      const purchaseId = startPurchase(deps, kalle, listingId);
      const besked = await deps.payments.authorize({ amount: 850, approve: true });
      if (besked.outcome !== "authorized") throw new Error("expected an authorization");
      // Betalning auktoriserad, the butikskontroll has answered giltig: leverans is next.
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
      const reservedUntil = listingRow(deps.db, listingId).reservedUntil!;

      // Half the rounds with the Clock exactly at reserved_until, half one millisecond before it
      // (where both are eligible and whichever commits first wins); the call order alternates.
      deps.clock.advance(reservedUntil.getTime() - deps.clock.now().getTime() - (round < 10 ? 0 : 1));
      const expire = () => expireDue(deps, reservedUntil);
      const deliver = () => deliverPurchase(deps, purchaseId);
      await Promise.all(round % 2 === 0 ? [expire(), deliver()] : [deliver(), expire()]);

      const purchase = purchaseRow(deps, purchaseId);
      const listing = listingRow(deps.db, listingId);
      const outcome = {
        purchase: purchase.status,
        listing: listing.status,
        captures: deps.payments.captureCount(besked.authorizationId),
        voids: deps.payments.countIn("voided"),
        held: deps.payments.countIn("authorized"),
      };
      expect([
        { purchase: "delivered", listing: "sold", captures: 1, voids: 0, held: 0 },
        { purchase: "failed", listing: "active", captures: 0, voids: 1, held: 0 },
      ]).toContainEqual(outcome);
      if (round < 10) expect(outcome.purchase, `round ${round}: the reservation has run out`).toBe("failed");
      seen.add(outcome.purchase);

      // Running both again changes nothing.
      await Promise.all([expire(), deliver()]);
      expect(purchaseRow(deps, purchaseId).status).toBe(purchase.status);
      expect(deps.payments.captureCount(besked.authorizationId)).toBe(outcome.captures);
    }
    expect([...seen].sort()).toEqual(["delivered", "failed"]);
  });
});
