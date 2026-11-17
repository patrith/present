import { and, asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { listings, purchases, statusHistory } from "@/db/schema";
import { approvePayment, getPurchaseForBuyer, startPurchase } from "@/domain/purchases";
import { makeTestDeps, publishNk, userId } from "../helpers";

function history(deps: ReturnType<typeof makeTestDeps>, entityType: "listing" | "purchase", id: number) {
  return deps.db
    .select()
    .from(statusHistory)
    .where(and(eq(statusHistory.entityType, entityType), eq(statusHistory.entityId, id)))
    .orderBy(asc(statusHistory.id))
    .all();
}

describe("purchase", () => {
  it("approved payment and valid check deliver the code", async () => {
    const deps = makeTestDeps();
    const kalle = userId(deps.db, "Kalle");
    const listingId = await publishNk(deps);

    const purchaseId = startPurchase(deps, kalle, listingId);
    const start = deps.clock.now();
    expect(deps.db.select().from(listings).where(eq(listings.id, listingId)).get()).toMatchObject({
      status: "reserved",
      reservedById: kalle,
      reservedUntil: new Date(start.getTime() + 5 * 60_000),
    });
    expect(deps.db.select().from(purchases).where(eq(purchases.id, purchaseId)).get()).toMatchObject({
      status: "started",
      amount: 850,
      buyerId: kalle,
    });
    expect(getPurchaseForBuyer(deps.db, kalle, purchaseId).giftCardCode).toBeUndefined();

    deps.clock.advance(30_000);
    expect(await approvePayment(deps, kalle, purchaseId)).toBe("delivered");

    const purchase = deps.db.select().from(purchases).where(eq(purchases.id, purchaseId)).get()!;
    expect(purchase).toMatchObject({ status: "delivered", deliveredAt: deps.clock.now() });
    expect(deps.db.select().from(listings).where(eq(listings.id, listingId)).get()!.status).toBe("sold");
    expect(deps.payments.captureCount(purchase.authorizationId!)).toBe(1);

    expect(history(deps, "purchase", purchaseId).map((h) => [h.fromStatus, h.toStatus])).toEqual([
      [null, "started"],
      ["started", "authorized"],
      ["authorized", "delivered"],
    ]);
    expect(history(deps, "listing", listingId).map((h) => [h.fromStatus, h.toStatus])).toEqual([
      [null, "active"],
      ["active", "reserved"],
      ["reserved", "sold"],
    ]);
    for (const h of [...history(deps, "purchase", purchaseId), ...history(deps, "listing", listingId)]) {
      expect(h.at).toBeInstanceOf(Date);
      expect(h.reason).not.toBe("");
    }
    expect(history(deps, "purchase", purchaseId)[0].actorUserId).toBe(kalle);

    const view = getPurchaseForBuyer(deps.db, kalle, purchaseId);
    expect(view).toMatchObject({ status: "delivered", amount: 850, giftCardCode: "NK-4471-9920" });
    expect(view.deliveredAt).toEqual(deps.clock.now());

    // A repeated approve neither captures nor delivers again.
    await expect(approvePayment(deps, kalle, purchaseId)).rejects.toMatchObject({ code: "wrong_purchase_status" });
    expect(deps.payments.captureCount(purchase.authorizationId!)).toBe(1);
  });

  it("failed check at purchase captures nothing and delivers no code", async () => {
    const deps = makeTestDeps();
    const kalle = userId(deps.db, "Kalle");
    const listingId = await publishNk(deps, "ANVAND-NK-0001");
    const purchaseId = startPurchase(deps, kalle, listingId);

    expect(await approvePayment(deps, kalle, purchaseId)).toBe("check_failed");

    const purchase = deps.db.select().from(purchases).where(eq(purchases.id, purchaseId)).get()!;
    expect(purchase.status).not.toBe("delivered");
    expect(purchase.authorizationId).toBeTruthy();
    expect(deps.payments.captureCount(purchase.authorizationId!)).toBe(0);
    expect(getPurchaseForBuyer(deps.db, kalle, purchaseId).giftCardCode).toBeUndefined();
    expect(JSON.stringify(getPurchaseForBuyer(deps.db, kalle, purchaseId))).not.toContain("ANVAND-NK-0001");
  });

  it("only the buyer can open or act on the payment step", async () => {
    const deps = makeTestDeps();
    const kalle = userId(deps.db, "Kalle");
    const lisa = userId(deps.db, "Lisa");
    const sara = userId(deps.db, "Sara");
    const listingId = await publishNk(deps);
    const purchaseId = startPurchase(deps, kalle, listingId);
    const before = deps.db.select().from(purchases).where(eq(purchases.id, purchaseId)).get();

    for (const other of [lisa, sara]) {
      expect(() => getPurchaseForBuyer(deps.db, other, purchaseId)).toThrow(
        expect.objectContaining({ code: "forbidden" }),
      );
      await expect(approvePayment(deps, other, purchaseId)).rejects.toMatchObject({ code: "forbidden" });
    }
    expect(deps.db.select().from(purchases).where(eq(purchases.id, purchaseId)).get()).toEqual(before);
    expect(history(deps, "purchase", purchaseId)).toHaveLength(1);
  });
});
