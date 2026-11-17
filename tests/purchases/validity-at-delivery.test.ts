import { describe, expect, it } from "vitest";
import { approvePayment, getPurchaseForBuyer, startPurchase } from "@/domain/purchases";
import {
  forceListingStatus,
  listingRow,
  makeTestDeps,
  publishNk,
  purchaseRow,
  spyOnVerifier,
  type TestDeps,
  userId,
} from "../helpers";

const END = new Date("2026-11-18T00:00:00+01:00"); // end of giltighetsdatum 2026-11-17

/** Kalle's Påbörjat köp of Sara's annons with giltighetsdatum 2026-11-17, started at 23:59. */
async function lastMinutePurchase(): Promise<{ deps: TestDeps; kalle: number; listingId: number; purchaseId: number }> {
  const deps = makeTestDeps();
  const kalle = userId(deps.db, "Kalle");
  const listingId = await publishNk(deps);
  forceListingStatus(deps.db, listingId, "active", { validUntil: "2026-11-17" });
  deps.clock.advance(END.getTime() - 60_000 - deps.clock.now().getTime());
  const purchaseId = startPurchase(deps, kalle, listingId);
  return { deps, kalle, listingId, purchaseId };
}

function expectCardExpired(deps: TestDeps, kalle: number, listingId: number, purchaseId: number) {
  expect(purchaseRow(deps, purchaseId)).toMatchObject({ status: "failed", failureReason: "kortet har gått ut" });
  expect(listingRow(deps.db, listingId).status).toBe("expired");
  expect(deps.payments.countIn("authorized")).toBe(0);
  expect(deps.payments.totalCaptures()).toBe(0);
  const view = getPurchaseForBuyer(deps.db, kalle, purchaseId);
  expect(view).toMatchObject({ status: "failed", failureReason: "kortet har gått ut" });
  expect(view.giftCardCode).toBeUndefined();
}

describe("giltighet at leverans", () => {
  it("expired card is never delivered", async () => {
    // Scenario S05: the butikskontroll answers giltig with the full saldo, but the giltighet ends
    // before the leverans commits.
    {
      const { deps, kalle, listingId, purchaseId } = await lastMinutePurchase();
      const inner = deps.verifier;
      deps.verifier = {
        verify: async (request) => {
          const answer = await inner.verify(request);
          deps.clock.advance(END.getTime() + 1_000 - deps.clock.now().getTime());
          return answer;
        },
      };
      const outcome = await approvePayment(deps, kalle, purchaseId);
      expect(outcome).toEqual({ kind: "unchanged", status: "failed" });
      expectCardExpired(deps, kalle, listingId, purchaseId);
      expect(deps.payments.countIn("voided")).toBe(1);
    }

    // Scenario S06: Kalle approves after the giltighet ended, before any expiry ran.
    {
      const { deps, kalle, listingId, purchaseId } = await lastMinutePurchase();
      const verifier = spyOnVerifier(deps);
      deps.clock.advance(END.getTime() + 30_000 - deps.clock.now().getTime());
      const outcome = await approvePayment(deps, kalle, purchaseId);
      expect(outcome).toEqual({ kind: "unchanged", status: "failed" });
      expectCardExpired(deps, kalle, listingId, purchaseId);
      // The authorization the approval created is released, not kept.
      expect(deps.payments.countIn("voided")).toBe(1);
      expect(verifier.calls.length).toBeLessThanOrEqual(1);
    }
  });
});
