import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { purchases, type PurchaseStatus } from "@/db/schema";
import { giftCardCodeFor } from "@/domain/gift-card-code";
import { getPurchaseForBuyer } from "@/domain/purchases";
import { deliveredPurchase } from "./delivered";

describe("presentkortskod after leverans", () => {
  it("buyer sees code until refunded and admin never", async () => {
    const { deps, kalle, admin, listingId, purchaseId, code } = await deliveredPurchase();
    expect(deps.db.select().from(purchases).where(eq(purchases.id, purchaseId)).get()!.deliveredAt).toEqual(
      deps.clock.now(),
    );

    const expected: [PurchaseStatus, boolean][] = [
      ["delivered", true],
      ["completed", true],
      ["disputed", true],
      ["refunded", false],
    ];
    for (const [status, buyerSees] of expected) {
      // Fixture: the köp put straight into each after-leverans status.
      deps.db.update(purchases).set({ status }).where(eq(purchases.id, purchaseId)).run();
      expect(giftCardCodeFor(deps.db, kalle, listingId), status).toBe(buyerSees ? code : undefined);
      expect(getPurchaseForBuyer(deps.db, kalle, purchaseId).giftCardCode, status).toBe(buyerSees ? code : undefined);
      expect(giftCardCodeFor(deps.db, admin, listingId), `admin in ${status}`).toBeUndefined();
    }
  });
});
