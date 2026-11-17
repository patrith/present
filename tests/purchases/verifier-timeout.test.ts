import { describe, expect, it } from "vitest";
import type { GiftCardVerifier, VerificationResult } from "@/adapters/gift-card-verifier";
import { approvePayment, startPurchase } from "@/domain/purchases";
import { historyOf, listingRow, makeTestDeps, publishNk, purchaseRow, userId } from "../helpers";

/** A butikskontroll that answers giltig only after `delayMs` (publicering answers at once). */
function slowVerifier(delayMs: number): GiftCardVerifier & { answered: Promise<void> } {
  let markAnswered!: () => void;
  const answered = new Promise<void>((resolve) => (markAnswered = resolve));
  return {
    answered,
    async verify({ declaredBalance, phase }): Promise<VerificationResult> {
      if (phase === "purchase") {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        markAnswered();
      }
      return { outcome: "valid", balance: declaredBalance };
    },
  };
}

describe("butikskontroll timeout", () => {
  it("late giltig answer after timeout is ignored", async () => {
    const deps = makeTestDeps();
    const verifier = slowVerifier(200);
    deps.verifier = verifier;
    deps.config = { ...deps.config, verifierTimeoutMs: 50 };
    const kalle = userId(deps.db, "Kalle");
    const listingId = await publishNk(deps);
    const purchaseId = startPurchase(deps, kalle, listingId);

    // The köp fails at the timeout, before the answer arrives.
    const outcome = await approvePayment(deps, kalle, purchaseId);
    expect(outcome).toEqual({ kind: "failed", reason: "butikskontrollen svarade inte" });
    expect(purchaseRow(deps, purchaseId)).toMatchObject({ status: "failed", failureReason: "butikskontrollen svarade inte" });
    expect(listingRow(deps.db, listingId).status).toBe("active");
    const historyCount = historyOf(deps, "purchase", purchaseId).length + historyOf(deps, "listing", listingId).length;

    // The late giltig answer changes nothing.
    await verifier.answered;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(purchaseRow(deps, purchaseId).status).toBe("failed");
    expect(listingRow(deps.db, listingId).status).toBe("active");
    expect(deps.payments.totalCaptures()).toBe(0);
    expect(deps.payments.countIn("authorized")).toBe(0);
    expect(historyOf(deps, "purchase", purchaseId).length + historyOf(deps, "listing", listingId).length).toBe(
      historyCount,
    );
  });
});
