import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { purchases, type PurchaseStatus } from "@/db/schema";
import { expireDue } from "@/domain/expire-due";
import { claimPurchase, getPurchaseForBuyer } from "@/domain/purchases";
import { historyOf, purchaseRow, type TestDeps } from "../helpers";
import { CLAIM_PERIOD_MS, deliveredPurchase, historyCount, payoutOf } from "./delivered";

const MOTIVATION = "Kassan sa att koden redan är använd";

function snapshot(deps: TestDeps, purchaseId: number, sellerId: number) {
  return { status: purchaseRow(deps, purchaseId).status, history: historyCount(deps), payout: payoutOf(deps, sellerId) };
}

describe("reklamation", () => {
  it("claim opens dispute and refusals change nothing", async () => {
    const { deps, sara, kalle, lisa, purchaseId, code } = await deliveredPurchase();
    let refunds = 0;
    const refund = deps.payments.refund.bind(deps.payments);
    deps.payments.refund = (id) => {
      refunds += 1;
      return refund(id);
    };

    // Refused: an empty motivering, and anyone but the köpare.
    const before = snapshot(deps, purchaseId, sara);
    await expect(claimPurchase(deps, kalle, purchaseId, "   ")).rejects.toMatchObject({
      code: "invalid_input",
      field: "claimReason",
      message: expect.stringContaining("Beskriv"),
    });
    for (const other of [sara, lisa]) {
      await expect(claimPurchase(deps, other, purchaseId, MOTIVATION)).rejects.toMatchObject({ code: "forbidden" });
    }
    expect(snapshot(deps, purchaseId, sara)).toEqual(before);

    // Kalle reklamerar: Tvist, motivering stored, no credit and no återbetalning.
    await claimPurchase(deps, kalle, purchaseId, MOTIVATION);
    expect(purchaseRow(deps, purchaseId)).toMatchObject({ status: "disputed", claimReason: MOTIVATION });
    expect(historyOf(deps, "purchase", purchaseId).at(-1)).toMatchObject({
      fromStatus: "delivered",
      toStatus: "disputed",
      actorUserId: kalle,
      reason: "köparen reklamerade",
    });
    expect(getPurchaseForBuyer(deps.db, kalle, purchaseId).giftCardCode).toBe(code);
    expect(refunds).toBe(0);

    // Past the reklamationsperiod the Tvist köp stays uncredited.
    deps.clock.advance(2 * CLAIM_PERIOD_MS);
    await expireDue(deps, deps.clock.now());
    expect(purchaseRow(deps, purchaseId).status).toBe("disputed");
    expect(payoutOf(deps, sara)).toBe(0);

    // Refused in Tvist, Avslutat and Återbetalat.
    for (const status of ["disputed", "completed", "refunded"] as PurchaseStatus[]) {
      deps.db.update(purchases).set({ status }).where(eq(purchases.id, purchaseId)).run();
      const s = snapshot(deps, purchaseId, sara);
      await expect(claimPurchase(deps, kalle, purchaseId, MOTIVATION), status).rejects.toMatchObject({
        code: "wrong_purchase_status",
        message: expect.stringContaining("kan inte reklameras"),
      });
      expect(snapshot(deps, purchaseId, sara)).toEqual(s);
    }
    expect(refunds).toBe(0);
  });

  it("claim after the period has lapsed is refused", async () => {
    const { deps, sara, kalle, purchaseId } = await deliveredPurchase();
    deps.clock.advance(CLAIM_PERIOD_MS);
    // No sweep has run yet: the reklamation runs the time rules first and finds the köp Avslutat.
    await expect(claimPurchase(deps, kalle, purchaseId, MOTIVATION)).rejects.toMatchObject({
      code: "wrong_purchase_status",
    });
    expect(purchaseRow(deps, purchaseId)).toMatchObject({ status: "completed", claimReason: null });
    expect(payoutOf(deps, sara)).toBe(850);
  });
});
