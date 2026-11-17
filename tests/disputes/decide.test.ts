import { describe, expect, it } from "vitest";
import { claimPurchase, decideDispute, getPurchaseForBuyer, getPurchasePage } from "@/domain/purchases";
import { historyOf, listingRow, purchaseRow } from "../helpers";
import { deliveredPurchase, payoutOf, snapshot } from "../purchases/delivered";

/** Kalle's köp at 850 kr in Tvist, with every återbetalning call counted. */
async function disputedPurchase() {
  const fixture = await deliveredPurchase();
  await claimPurchase(fixture.deps, fixture.kalle, fixture.purchaseId, "Kassan sa att koden redan är använd");
  const refunds: string[] = [];
  const refund = fixture.deps.payments.refund.bind(fixture.deps.payments);
  fixture.deps.payments.refund = (id) => {
    refunds.push(id);
    return refund(id);
  };
  return { ...fixture, refunds };
}

describe("tvist decisions", () => {
  it("refund and reject each settle once and only for the admin", async () => {
    // Återbetala.
    const r = await disputedPurchase();
    const before = snapshot(r.deps, r.purchaseId, r.sara);
    for (const other of [r.kalle, r.sara, r.lisa]) {
      for (const decision of ["refund", "reject"] as const) {
        await expect(decideDispute(r.deps, other, r.purchaseId, decision)).rejects.toMatchObject({ code: "forbidden" });
      }
    }
    expect(snapshot(r.deps, r.purchaseId, r.sara)).toEqual(before);
    expect(r.refunds).toHaveLength(0);

    await decideDispute(r.deps, r.admin, r.purchaseId, "refund");
    expect(purchaseRow(r.deps, r.purchaseId)).toMatchObject({ status: "refunded", adminDecision: "refund" });
    expect(historyOf(r.deps, "purchase", r.purchaseId).at(-1)).toMatchObject({
      fromStatus: "disputed",
      toStatus: "refunded",
      actorUserId: r.admin,
      reason: "administratören beviljade reklamationen",
    });
    const { authorizationId, amount } = purchaseRow(r.deps, r.purchaseId);
    expect(r.refunds).toEqual([authorizationId]);
    expect(amount).toBe(850);
    expect(r.deps.payments.countIn("refunded")).toBe(1);
    expect(listingRow(r.deps.db, r.listingId).status).toBe("sold");
    expect(payoutOf(r.deps, r.sara)).toBe(0);
    expect(getPurchaseForBuyer(r.deps.db, r.kalle, r.purchaseId).giftCardCode).toBeUndefined();
    expect(getPurchasePage(r.deps, r.kalle, r.purchaseId).refund).toEqual({ label: "Simulerad återbetalning", amount: 850 });

    // A second decision, sequential or concurrent, is refused and changes nothing.
    const decided = snapshot(r.deps, r.purchaseId, r.sara);
    for (const decision of ["refund", "reject"] as const) {
      await expect(decideDispute(r.deps, r.admin, r.purchaseId, decision)).rejects.toMatchObject({
        code: "wrong_purchase_status",
        message: "Tvisten är redan avgjord.",
      });
    }
    expect(snapshot(r.deps, r.purchaseId, r.sara)).toEqual(decided);
    expect(r.refunds).toHaveLength(1);

    // Avslå.
    const j = await disputedPurchase();
    await decideDispute(j.deps, j.admin, j.purchaseId, "reject");
    expect(purchaseRow(j.deps, j.purchaseId)).toMatchObject({ status: "completed", adminDecision: "reject" });
    expect(historyOf(j.deps, "purchase", j.purchaseId).at(-1)).toMatchObject({
      fromStatus: "disputed",
      toStatus: "completed",
      actorUserId: j.admin,
      reason: "administratören avslog reklamationen",
    });
    expect(payoutOf(j.deps, j.sara)).toBe(850);
    expect(j.refunds).toHaveLength(0);
    await expect(decideDispute(j.deps, j.admin, j.purchaseId, "reject")).rejects.toMatchObject({
      code: "wrong_purchase_status",
    });
    expect(payoutOf(j.deps, j.sara)).toBe(850);

    // Concurrent decisions on one tvist: exactly one applies.
    const c = await disputedPurchase();
    const results = await Promise.allSettled([
      decideDispute(c.deps, c.admin, c.purchaseId, "refund"),
      decideDispute(c.deps, c.admin, c.purchaseId, "reject"),
    ]);
    expect(results.map((x) => x.status).sort()).toEqual(["fulfilled", "rejected"]);
    const settled = purchaseRow(c.deps, c.purchaseId).status;
    expect(["refunded", "completed"]).toContain(settled);
    expect(payoutOf(c.deps, c.sara)).toBe(settled === "completed" ? 850 : 0);
    expect(c.refunds).toHaveLength(settled === "refunded" ? 1 : 0);
    expect(historyOf(c.deps, "purchase", c.purchaseId).filter((h) => h.fromStatus === "disputed")).toHaveLength(1);
  });
});
