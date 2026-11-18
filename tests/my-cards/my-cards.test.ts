import { describe, expect, it } from "vitest";
import { getListing, searchListings } from "@/domain/listings";
import { getMyCards, MY_CARDS_EMPTY } from "@/domain/my-cards";
import { listingStatusLabel, purchaseStatusLabel } from "@/domain/status";
import { approvePayment, startPurchase } from "@/domain/purchases";
import { expireDue } from "@/domain/expire-due";
import { forceListingStatus, makeTestDeps, publishNk, userId } from "../helpers";
import { everyStatus } from "./fixtures";

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
    expect(lisas.mine).toEqual({ listings: [], purchases: [], payoutBalance: 0 });
    expect(JSON.stringify(lisas)).not.toContain(code);
  });

  // S06
  it("seller sees payout balance", async () => {
    const { deliveredPurchase } = await import("../purchases/delivered");
    const { confirmPurchase } = await import("@/domain/purchases");
    const { deps, sara, kalle, purchaseId } = await deliveredPurchase();
    expect(getMyCards(deps.db, sara).payoutBalance).toBe(0);
    await confirmPurchase(deps, kalle, purchaseId);
    expect(getMyCards(deps.db, sara).payoutBalance).toBe(850);
    expect(getMyCards(deps.db, kalle).payoutBalance).toBe(0);
  });

  // S07
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

  // S08
  it("seller sees every listing status with reason and an empty state", async () => {
    const { deps, sara, lisa, listings: l } = await everyStatus();
    const mine = getMyCards(deps.db, sara);

    // Newest first, every own annons in every status.
    const ids = mine.listings.map((x) => x.id);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
    const byId = (id: number) => mine.listings.find((x) => x.id === id)!;
    expect(byId(l.active)).toMatchObject({ status: "active", merchantName: "Nordiska Kompagniet", price: 850, balance: 1000 });
    expect(byId(l.reserved).status).toBe("reserved");
    expect(byId(l.sold).status).toBe("sold");
    expect(byId(l.flagged)).toMatchObject({ status: "flagged", flagReason: "saldoavvikelse", expiryReason: null });
    expect(byId(l.expired)).toMatchObject({
      status: "expired",
      merchantName: "ICA",
      price: 400,
      balance: 500,
      expiryReason: "giltighetsdatumet 2026-11-17 har passerat",
    });
    expect(byId(l.withdrawn)).toMatchObject({ status: "withdrawn", expiryReason: null });
    expect(Object.values(l).map((id) => listingStatusLabel[byId(id).status])).toEqual([
      "Aktiv",
      "Reserverad",
      "Såld",
      "Flaggad",
      "Utgången",
      "Återkallad",
    ]);
    expect(mine.payoutBalance).toBe(850);

    // Lisa has no annonser: the empty state links to publicering.
    expect(getMyCards(deps.db, lisa).listings).toEqual([]);
    expect(MY_CARDS_EMPTY.listings).toEqual({ text: "Du har inga annonser.", linkText: "Publicera ett kort", href: "/salj" });
  });

  it("buyer sees every purchase status with code only where entitled and an empty state", async () => {
    const { deps, kalle, lisa, purchases: p } = await everyStatus();
    const mine = getMyCards(deps.db, kalle);

    const ids = mine.purchases.map((x) => x.id);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
    const byId = (id: number) => mine.purchases.find((x) => x.id === id)!;
    expect(Object.values(p).map((id) => purchaseStatusLabel[byId(id).status])).toEqual([
      "Påbörjat",
      "Levererat",
      "Avslutat",
      "Tvist",
      "Återbetalat",
      "Misslyckat",
      "Misslyckat",
    ]);
    for (const id of Object.values(p)) {
      expect(byId(id)).toMatchObject({ merchantName: "Nordiska Kompagniet", amount: 850 });
    }
    // The code for Levererat, Avslutat and Tvist only (story S06's rule).
    expect(byId(p.delivered).giftCardCode).toBe("NK-DELIVERED-1");
    expect(byId(p.completed).giftCardCode).toBe("NK-COMPLETED-1");
    expect(byId(p.disputed).giftCardCode).toBe("NK-DISPUTED-1");
    for (const id of [p.started, p.refunded, p.declined, p.balanceMismatch]) {
      expect(byId(id).giftCardCode).toBeUndefined();
    }
    expect(byId(p.declined)).toMatchObject({ failureReason: "betalningen nekades", failedAtCheck: false });
    expect(byId(p.balanceMismatch)).toMatchObject({ status: "failed", failedAtCheck: true });
    expect(byId(p.balanceMismatch).failureReason).toMatch(/^saldoavvikelse: /);
    // Påbörjat: the card leads back to the payment step on the köp page.
    expect(byId(p.started).status).toBe("started");

    // Nothing Kalle receives carries a code he is not entitled to.
    const serialized = JSON.stringify(mine);
    for (const code of ["NK-RESERVED-1", "NK-REFUNDED-1", "NK-DECLINED-1", "DELVIS-FLAGGED-1"]) {
      expect(serialized).not.toContain(code);
    }

    // Lisa has bought nothing: the empty state links to sökningen; her utbetalningssaldo is 0 kr.
    const lisas = getMyCards(deps.db, lisa);
    expect(lisas.purchases).toEqual([]);
    expect(lisas.payoutBalance).toBe(0);
    expect(MY_CARDS_EMPTY.purchases).toEqual({
      text: "Du har inte köpt några kort.",
      linkText: "Sök erbjudanden",
      href: "/erbjudanden",
    });
  });
});
