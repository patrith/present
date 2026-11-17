import { describe, expect, it } from "vitest";
import { searchListings } from "@/domain/listings";
import { declinePayment, getPurchaseForBuyer, startPurchase } from "@/domain/purchases";
import { historyOf, listingRow, makeTestDeps, publishNk, purchaseRow, userId } from "../helpers";

describe("payment step", () => {
  it("declined payment fails purchase and reactivates listing", async () => {
    const deps = makeTestDeps();
    const kalle = userId(deps.db, "Kalle");
    const listingId = await publishNk(deps);
    const purchaseId = startPurchase(deps, kalle, listingId);
    expect(searchListings(deps.db).some((l) => l.id === listingId)).toBe(false);

    expect(await declinePayment(deps, kalle, purchaseId)).toEqual({ kind: "failed", reason: "betalningen nekades" });

    expect(purchaseRow(deps, purchaseId)).toMatchObject({
      status: "failed",
      failureReason: "betalningen nekades",
      authorizationId: null,
    });
    expect(listingRow(deps, listingId)).toMatchObject({ status: "active", reservedById: null, reservedUntil: null });
    expect(searchListings(deps.db).some((l) => l.id === listingId)).toBe(true);
    expect(deps.payments.totalCaptures()).toBe(0);
    expect(deps.payments.countIn("authorized")).toBe(0);
    expect(getPurchaseForBuyer(deps.db, kalle, purchaseId).giftCardCode).toBeUndefined();

    expect(historyOf(deps, "purchase", purchaseId).at(-1)).toMatchObject({
      fromStatus: "started",
      toStatus: "failed",
      actorUserId: kalle,
      reason: "betalningen nekades",
    });
    expect(historyOf(deps, "listing", listingId).at(-1)).toMatchObject({
      fromStatus: "reserved",
      toStatus: "active",
      actorUserId: kalle,
      reason: "betalningen nekades",
    });

    // A repeated decline changes nothing.
    await expect(declinePayment(deps, kalle, purchaseId)).rejects.toMatchObject({ code: "wrong_purchase_status" });
    expect(historyOf(deps, "purchase", purchaseId)).toHaveLength(2);
  });

  it("another user cannot decline the buyers purchase", async () => {
    const deps = makeTestDeps();
    const kalle = userId(deps.db, "Kalle");
    const listingId = await publishNk(deps);
    const purchaseId = startPurchase(deps, kalle, listingId);
    const before = { purchase: purchaseRow(deps, purchaseId), listing: listingRow(deps, listingId) };

    for (const other of [userId(deps.db, "Lisa"), userId(deps.db, "Sara")]) {
      await expect(declinePayment(deps, other, purchaseId)).rejects.toMatchObject({ code: "forbidden" });
    }
    expect(purchaseRow(deps, purchaseId)).toEqual(before.purchase);
    expect(listingRow(deps, listingId)).toEqual(before.listing);
    expect(historyOf(deps, "purchase", purchaseId)).toHaveLength(1);
  });
});
