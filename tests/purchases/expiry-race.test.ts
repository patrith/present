import { describe, expect, it } from "vitest";
import { expireDue } from "@/domain/expire-due";
import { deliverPurchase, startPurchase } from "@/domain/purchases";
import { authorizeDirectly, forceListingStatus, listingRow, makeTestDeps, publishNk, purchaseRow, userId } from "../helpers";

describe("expiry against leverans", () => {
  it("expiry and delivery never both apply", async () => {
    const seen = new Set<string>();
    for (let round = 0; round < 20; round++) {
      const deps = makeTestDeps();
      const kalle = userId(deps.db, "Kalle");
      const listingId = await publishNk(deps);
      const purchaseId = startPurchase(deps, kalle, listingId);
      // Betalning auktoriserad, the butikskontroll has answered giltig: leverans is next.
      const authorizationId = await authorizeDirectly(deps, purchaseId);
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
        captures: deps.payments.captureCount(authorizationId),
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
      expect(deps.payments.captureCount(authorizationId)).toBe(outcome.captures);
    }
    expect([...seen].sort()).toEqual(["delivered", "failed"]);
  });
});

// S07 – FR8: giltighet expiry against leverans. -------------------------------------------------

describe("giltighet expiry against leverans", () => {
  it("validity expiry and delivery never both apply", async () => {
    const end = new Date("2026-11-18T00:00:00+01:00"); // end of giltighetsdatum 2026-11-17
    for (const offsetMs of [0, 1]) {
      for (let round = 0; round < 20; round++) {
        const deps = makeTestDeps();
        const kalle = userId(deps.db, "Kalle");
        const listingId = await publishNk(deps);
        forceListingStatus(deps.db, listingId, "active", { validUntil: "2026-11-17" });
        // Reserved 23:58 until 00:03, so only the giltighet decides.
        deps.clock.advance(end.getTime() - 2 * 60_000 - deps.clock.now().getTime());
        const purchaseId = startPurchase(deps, kalle, listingId);
        const authorizationId = await authorizeDirectly(deps, purchaseId);

        // At the end instant, then one millisecond before it; the call order alternates.
        const t = new Date(end.getTime() - offsetMs);
        deps.clock.advance(t.getTime() - deps.clock.now().getTime());
        const expire = () => expireDue(deps, t);
        const deliver = () => deliverPurchase(deps, purchaseId);
        await Promise.all(round % 2 === 0 ? [expire(), deliver()] : [deliver(), expire()]);

        const outcome = {
          purchase: purchaseRow(deps, purchaseId).status,
          listing: listingRow(deps.db, listingId).status,
          captures: deps.payments.captureCount(authorizationId),
          voids: deps.payments.countIn("voided"),
          held: deps.payments.countIn("authorized"),
        };
        const expired = { purchase: "failed", listing: "expired", captures: 0, voids: 1, held: 0 };
        if (offsetMs === 0) {
          expect(outcome, `round ${round}: the giltighet has ended`).toEqual(expired);
          expect(purchaseRow(deps, purchaseId).failureReason).toBe("kortet har gått ut");
        } else {
          expect([{ purchase: "delivered", listing: "sold", captures: 1, voids: 0, held: 0 }, expired]).toContainEqual(
            outcome,
          );
        }
      }
    }
  });
});
