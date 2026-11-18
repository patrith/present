import { describe, expect, it } from "vitest";
import { getListingView } from "@/domain/listings";
import { makeTestDeps, publishNk, userId } from "../helpers";
import { addListing } from "./fixtures";

describe("listing view", () => {
  it("listing view shows discount, validity warning and check status without the code", async () => {
    const deps = makeTestDeps(); // Clock fixed at 2026-11-17 12:00 Swedish time.
    const id = await publishNk(deps, "NK-4471-9920");

    const view = getListingView(deps, id);
    expect(view).toMatchObject({
      merchantName: "Nordiska Kompagniet",
      balance: 1000,
      price: 850,
      discountKr: 150,
      discountPct: 15,
      validUntil: "2027-11-17",
      checkStatus: "verified",
      shortValidity: false,
      status: "active",
    });
    expect(JSON.stringify(view)).not.toContain("NK-4471-9920");
    expect(Object.keys(view!)).not.toContain("giftCardCode");

    // Scenario S04: the two dates either side of the 7-day line.
    const lisa = userId(deps.db, "Lisa");
    const soon = addListing(deps, lisa, { merchantId: "AH", balance: 500, price: 400, validUntil: "2026-11-23" });
    const later = addListing(deps, lisa, { merchantId: "AH", balance: 500, price: 400, validUntil: "2026-11-24" });
    expect(getListingView(deps, soon)?.shortValidity).toBe(true);
    expect(getListingView(deps, later)?.shortValidity).toBe(false);
    expect(getListingView(deps, 999_999)).toBeUndefined();
  });
});
