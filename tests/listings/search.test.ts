import { describe, expect, it } from "vitest";
import { listingStatuses } from "@/db/schema";
import { getListing, getListingView, searchListings, searchSorts } from "@/domain/listings";
import { startPurchase } from "@/domain/purchases";
import { getCurrentDeps } from "@/server/deps";
import { makeTestDeps, publishNk, userId } from "../helpers";
import { addListing, clearListings } from "./fixtures";

describe("search and listing view", () => {
  it("search and listing view never carry the gift card code", async () => {
    const deps = makeTestDeps();
    const code = "NK-4471-9920";
    const id = await publishNk(deps, code);
    const kalle = userId(deps.db, "Kalle");

    const search = searchListings(deps, kalle);
    const view = getListing(deps.db, id);
    const listingView = getListingView(deps, id);
    expect(search.some((l) => l.id === id)).toBe(true);
    expect(view?.id).toBe(id);

    // Every filter and sortering combination selects the same code-free columns.
    const combinations = [undefined, "NK", "AH", "FS", "CO", "ICA", "XYZ"].flatMap((merchantId) =>
      [undefined, ...searchSorts].map((sort) => searchListings(deps, kalle, { merchantId, sort })),
    );
    expect(combinations.some((r) => r.length > 0)).toBe(true);

    const serialized = JSON.stringify({ search, view, listingView, combinations });
    expect(serialized).not.toContain(code);
    // No seeded code leaks either.
    expect(serialized).not.toMatch(/SEED-/);
    expect(Object.keys(view!)).not.toContain("giftCardCode");
    for (const row of [...combinations.flat(), listingView!]) expect(Object.keys(row)).not.toContain("giftCardCode");
  });

  it("search excludes own and non-active listings and filters on merchant", () => {
    const deps = makeTestDeps();
    clearListings(deps);
    const [sara, kalle, lisa] = (["Sara", "Kalle", "Lisa"] as const).map((n) => userId(deps.db, n));

    // Scenario S01: only Sara's Aktiv NK annons, neither Kalle's own nor Sara's non-Aktiv ones.
    const nk = addListing(deps, sara, { merchantId: "NK", balance: 1000, price: 850, validUntil: "2027-11-17" });
    addListing(deps, kalle, { merchantId: "AH", balance: 500, price: 400 });
    for (const status of listingStatuses.filter((s) => s !== "active"))
      addListing(deps, sara, { merchantId: "NK", balance: 700, price: 500, status });

    expect(searchListings(deps, kalle)).toEqual([
      {
        id: nk,
        sellerId: sara,
        sellerFirstName: "Sara",
        merchantId: "NK",
        merchantName: "Nordiska Kompagniet",
        balance: 1000,
        price: 850,
        validUntil: "2027-11-17",
        status: "active",
        flagReason: null,
        discountKr: 150,
        discountPct: 15,
        shortValidity: false,
        checkStatus: "verified",
      },
    ]);

    // Scenario S05: when no annons but Kalle's own is Aktiv, his sökningen is empty.
    expect(searchListings(deps, sara).map((l) => l.sellerId)).toEqual([kalle]);
    clearListings(deps);
    addListing(deps, kalle, { merchantId: "NK", balance: 500, price: 400 });
    expect(searchListings(deps, kalle)).toEqual([]);

    // Scenario S02: two NK, one Åhléns and one ICA annons of other users.
    clearListings(deps);
    const nk1 = addListing(deps, sara, { merchantId: "NK", balance: 1000, price: 850 });
    const nk2 = addListing(deps, lisa, { merchantId: "NK", balance: 500, price: 450 });
    const ah = addListing(deps, sara, { merchantId: "AH", balance: 300, price: 270 });
    const ica = addListing(deps, lisa, { merchantId: "ICA", balance: 200, price: 150 });

    const ids = (merchantId?: string) =>
      searchListings(deps, kalle, { merchantId })
        .map((l) => l.id)
        .sort();
    expect(ids("NK")).toEqual([nk1, nk2].sort());
    expect(ids(undefined)).toEqual([nk1, nk2, ah, ica].sort());
    expect(ids("FS")).toEqual([]);
  });

  it("search sorts by discount by default, by price and by validity", () => {
    const deps = makeTestDeps();
    clearListings(deps);
    const [sara, kalle, lisa] = (["Sara", "Kalle", "Lisa"] as const).map((n) => userId(deps.db, n));

    // Scenario S03: A 10 %, B 30 %, C 15 %.
    const a = addListing(deps, sara, { merchantId: "NK", balance: 1000, price: 900, validUntil: "2027-06-30" });
    const b = addListing(deps, lisa, { merchantId: "NK", balance: 500, price: 350, validUntil: "2027-01-31" });
    const c = addListing(deps, sara, { merchantId: "AH", balance: 200, price: 170, validUntil: "2027-12-31" });

    const order = (q?: Parameters<typeof searchListings>[2]) => searchListings(deps, kalle, q).map((l) => l.id);
    expect(order()).toEqual([b, c, a]);
    expect(searchListings(deps, kalle).map((l) => l.discountPct)).toEqual([30, 15, 10]);
    expect(order({ sort: "discount" })).toEqual([b, c, a]);
    expect(order({ sort: "price" })).toEqual([c, b, a]);
    expect(order({ sort: "validity" })).toEqual([c, a, b]);

    // With a handlare filter the chosen order holds within the urval.
    expect(order({ merchantId: "NK" })).toEqual([b, a]);
    expect(order({ merchantId: "NK", sort: "price" })).toEqual([b, a]);
    expect(order({ merchantId: "NK", sort: "validity" })).toEqual([a, b]);

    // Ties go to the earliest publication, even when the ids run the other way.
    clearListings(deps);
    const later = addListing(deps, sara, {
      merchantId: "ICA",
      balance: 400,
      price: 300,
      validUntil: "2027-05-01",
      publishedAt: new Date("2026-11-17T10:00:00Z"),
    });
    const earlier = addListing(deps, lisa, {
      merchantId: "ICA",
      balance: 200,
      price: 150,
      validUntil: "2027-05-01",
      publishedAt: new Date("2026-11-16T10:00:00Z"),
    });
    expect(order()).toEqual([earlier, later]);
    expect(order({ sort: "validity" })).toEqual([earlier, later]);
    const samePrice = addListing(deps, sara, {
      merchantId: "CO",
      balance: 300,
      price: 150,
      publishedAt: new Date("2026-11-17T11:00:00Z"),
    });
    expect(order({ sort: "price" })).toEqual([earlier, samePrice, later]);
  });

  it("expired reservation is listed again", async () => {
    const deps = makeTestDeps();
    const holder = globalThis as typeof globalThis & { __presentkortDeps?: unknown };
    holder.__presentkortDeps = deps; // what the pages' getCurrentDeps() starts from
    try {
      const id = await publishNk(deps);
      const kalle = userId(deps.db, "Kalle");
      startPurchase(deps, kalle, id);
      expect(searchListings(await getCurrentDeps(), kalle).some((l) => l.id === id)).toBe(false);

      // No sweep runs here: the sökning page's own expireDue call relists the annons.
      deps.clock.advance(5 * 60_000);
      expect(searchListings(await getCurrentDeps(), kalle).some((l) => l.id === id)).toBe(true);
    } finally {
      delete holder.__presentkortDeps;
    }
  });
});
