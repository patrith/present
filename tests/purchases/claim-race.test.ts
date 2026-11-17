import { describe, expect, it } from "vitest";
import { expireDue } from "@/domain/expire-due";
import { claimPurchase } from "@/domain/purchases";
import { historyOf, purchaseRow } from "../helpers";
import { CLAIM_PERIOD_MS, deliveredPurchase, payoutOf } from "./delivered";

describe("reklamation against the reklamationsperiod's lapse", () => {
  it("claim and claim-period expiry never both apply", async () => {
    for (let round = 0; round < 20; round++) {
      const { deps, sara, kalle, purchaseId } = await deliveredPurchase();
      // Even rounds: the Clock exactly at the period's end, where the expiry must win. Odd rounds:
      // the period ends now for expireDue, but the Clock is 1 ms before, so either may commit first.
      const periodEnd = new Date(deps.clock.now().getTime() + CLAIM_PERIOD_MS);
      deps.clock.advance(CLAIM_PERIOD_MS - (round % 2));
      const claim = claimPurchase(deps, kalle, purchaseId, "Koden fungerade inte").then(
        () => "accepted" as const,
        (e: { code?: string }) => {
          expect(e.code).toBe("wrong_purchase_status");
          return "refused" as const;
        },
      );
      const [claimResult] = await Promise.all([claim, expireDue(deps, periodEnd)]);

      const status = purchaseRow(deps, purchaseId).status;
      const outcome = {
        status,
        claim: claimResult,
        payout: payoutOf(deps, sara),
        completedRows: historyOf(deps, "purchase", purchaseId).filter((h) => h.toStatus === "completed").length,
      };
      expect([
        { status: "disputed", claim: "accepted", payout: 0, completedRows: 0 },
        { status: "completed", claim: "refused", payout: 850, completedRows: 1 },
      ]).toContainEqual(outcome);
      if (round % 2 === 0) expect(outcome.status, `round ${round}: the period has run out`).toBe("completed");
    }
  });
});
