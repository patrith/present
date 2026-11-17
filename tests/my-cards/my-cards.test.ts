import { describe, expect, it } from "vitest";
import { getListing, searchListings } from "@/domain/listings";
import { getMyCards } from "@/domain/my-cards";
import { approvePayment, startPurchase } from "@/domain/purchases";
import { expireDue } from "@/domain/expire-due";
import { forceListingStatus, makeTestDeps, publishNk, userId } from "../helpers";

describe("mina kort", () => {
  it("buyer sees delivered code, seller sees sold, third user sees neither", async () => {
    const deps = makeTestDeps();
    const [sara, kalle, lisa] = (["Sara", "Kalle", "Lisa"] as const).map((n) => userId(deps.db, n));
    const code = "NK-4471-9920";
    const listingId = await publishNk(deps, code);
    const purchaseId = startPurchase(deps, kalle, listingId);
    await approvePayment(deps, kalle, purchaseId);

    const kalles = getMyCards(deps.db, kalle);
    expect(kalles.purchases).toEqual([
      expect.objectContaining({
        id: purchaseId,
        merchantName: "Nordiska Kompagniet",
        amount: 850,
        status: "delivered",
        giftCardCode: code,
      }),
    ]);

    const saras = getMyCards(deps.db, sara);
    expect(saras.listings.find((l) => l.id === listingId)).toMatchObject({ price: 850, balance: 1000, status: "sold" });
    expect(saras.purchases).toEqual([]);

    // Lisa: her mina kort, sökningen and the annons carry no trace of the code.
    const lisas = { mine: getMyCards(deps.db, lisa), search: searchListings(deps, lisa), view: getListing(deps.db, listingId) };
    expect(lisas.mine).toEqual({ listings: [], purchases: [] });
    expect(JSON.stringify(lisas)).not.toContain(code);
  });

  it("seller sees expired listing with reason", async () => {
    const deps = makeTestDeps();
    const sara = userId(deps.db, "Sara");
    const listingId = await publishNk(deps);
    forceListingStatus(deps.db, listingId, "active", { validUntil: "2026-11-17" });
    expect(getMyCards(deps.db, sara).listings.find((l) => l.id === listingId)).toMatchObject({ expiryReason: null });

    await expireDue(deps, new Date("2026-11-18T00:00:00+01:00"));
    const mine = getMyCards(deps.db, sara).listings.find((l) => l.id === listingId)!;
    expect(mine.status).toBe("expired");
    expect(mine.expiryReason).toContain("2026-11-17");
    expect(mine.expiryReason).toBe("giltighetsdatumet 2026-11-17 har passerat");
  });
});
