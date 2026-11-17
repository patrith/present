import { describe, expect, it } from "vitest";
import { approvePayment, receivePaymentAnswer, startPurchase } from "@/domain/purchases";
import { historyOf, listingRow, makeTestDeps, publishNk, purchaseRow, userId } from "../helpers";

function countTo(history: { toStatus: string }[], status: string) {
  return history.filter((h) => h.toStatus === status).length;
}

describe("betalningsbesked", () => {
  it("duplicate besked sequential and concurrent capture once", async () => {
    for (const ordering of ["sequential", "concurrent"] as const) {
      const deps = makeTestDeps();
      const kalle = userId(deps.db, "Kalle");
      const listingId = await publishNk(deps);
      const purchaseId = startPurchase(deps, kalle, listingId);
      const besked = await deps.payments.authorize({ amount: 850, approve: true });
      if (besked.outcome !== "authorized") throw new Error("expected an authorization");

      const outcomes =
        ordering === "sequential"
          ? [await receivePaymentAnswer(deps, purchaseId, besked), await receivePaymentAnswer(deps, purchaseId, besked)]
          : await Promise.all([receivePaymentAnswer(deps, purchaseId, besked), receivePaymentAnswer(deps, purchaseId, besked)]);

      expect(outcomes.filter((o) => o.kind === "delivered"), ordering).toHaveLength(1);
      // The second besked returns the köp's current status.
      expect(outcomes.find((o) => o.kind !== "delivered"), ordering).toMatchObject({ kind: "unchanged" });
      expect(purchaseRow(deps, purchaseId).status).toBe("delivered");
      expect(listingRow(deps.db, listingId).status).toBe("sold");
      expect(deps.payments.captureCount(besked.authorizationId)).toBe(1);
      expect(deps.payments.countIn("voided")).toBe(0);

      const purchaseHistory = historyOf(deps, "purchase", purchaseId);
      expect(countTo(purchaseHistory, "authorized")).toBe(1);
      expect(countTo(purchaseHistory, "delivered")).toBe(1);
      expect(countTo(historyOf(deps, "listing", listingId), "sold")).toBe(1);
    }
  });

  it("two concurrent approves leave one capture and no held authorization", async () => {
    const deps = makeTestDeps();
    const kalle = userId(deps.db, "Kalle");
    const listingId = await publishNk(deps);
    const purchaseId = startPurchase(deps, kalle, listingId);

    const outcomes = await Promise.all([
      approvePayment(deps, kalle, purchaseId),
      approvePayment(deps, kalle, purchaseId),
    ]);

    expect(outcomes.filter((o) => o.kind === "delivered")).toHaveLength(1);
    expect(outcomes.find((o) => o.kind !== "delivered")).toMatchObject({ kind: "unchanged" });
    expect(purchaseRow(deps, purchaseId).status).toBe("delivered");
    expect(deps.payments.totalCaptures()).toBe(1);
    expect(deps.payments.countIn("voided")).toBe(1);
    expect(deps.payments.countIn("authorized")).toBe(0);
  });
});
