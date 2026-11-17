import { describe, expect, it } from "vitest";
import { claimPurchase, decideDispute, getPurchasePage } from "@/domain/purchases";
import { CLAIM_PERIOD_MS, deliveredPurchase } from "./delivered";

describe("köp page after leverans", () => {
  it("buyer actions and notes follow the köp status", async () => {
    const { deps, sara, kalle, lisa, admin, purchaseId, code } = await deliveredPurchase();

    const delivered = getPurchasePage(deps, kalle, purchaseId);
    expect(delivered).toMatchObject({ status: "delivered", canSettle: true, giftCardCode: code });
    expect(delivered.claimDeadline).toEqual(new Date(deps.clock.now().getTime() + CLAIM_PERIOD_MS));
    expect(delivered.disputeNote).toBeUndefined();
    expect(delivered.refund).toBeUndefined();

    // Only the köpare gets the page, and with it the actions.
    for (const other of [sara, lisa, admin]) {
      expect(() => getPurchasePage(deps, other, purchaseId)).toThrow(expect.objectContaining({ code: "forbidden" }));
    }

    await claimPurchase(deps, kalle, purchaseId, "Kassan sa att koden redan är använd");
    const disputed = getPurchasePage(deps, kalle, purchaseId);
    expect(disputed).toMatchObject({ status: "disputed", canSettle: false, giftCardCode: code });
    expect(disputed.disputeNote).toContain("Utbetalningen till säljaren är fryst");
    expect(disputed.refund).toBeUndefined();

    await decideDispute(deps, admin, purchaseId, "refund");
    const refunded = getPurchasePage(deps, kalle, purchaseId);
    expect(refunded).toMatchObject({
      status: "refunded",
      canSettle: false,
      refund: { label: "Simulerad återbetalning", amount: 850 },
    });
    expect(refunded.giftCardCode).toBeUndefined();
    expect(refunded.disputeNote).toBeUndefined();
  });
});
