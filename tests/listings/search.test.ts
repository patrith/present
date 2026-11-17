import { describe, expect, it } from "vitest";
import { getListing, searchListings } from "@/domain/listings";
import { startPurchase } from "@/domain/purchases";
import { getCurrentDeps } from "@/server/deps";
import { makeTestDeps, publishNk, userId } from "../helpers";

describe("search and listing view", () => {
  it("search and listing view never carry the gift card code", async () => {
    const deps = makeTestDeps();
    const code = "NK-4471-9920";
    const id = await publishNk(deps, code);

    const search = searchListings(deps.db);
    const view = getListing(deps.db, id);
    expect(search.some((l) => l.id === id)).toBe(true);
    expect(view?.id).toBe(id);

    const serialized = JSON.stringify({ search, view });
    expect(serialized).not.toContain(code);
    // No seeded code leaks either.
    expect(serialized).not.toMatch(/SEED-/);
    expect(Object.keys(view!)).not.toContain("giftCardCode");
  });

  it("expired reservation is listed again", async () => {
    const deps = makeTestDeps();
    const holder = globalThis as typeof globalThis & { __presentkortDeps?: unknown };
    holder.__presentkortDeps = deps; // what the pages' getCurrentDeps() starts from
    try {
      const id = await publishNk(deps);
      startPurchase(deps, userId(deps.db, "Kalle"), id);
      expect(searchListings((await getCurrentDeps()).db).some((l) => l.id === id)).toBe(false);

      // No sweep runs here: the sökning page's own expireDue call relists the annons.
      deps.clock.advance(5 * 60_000);
      expect(searchListings((await getCurrentDeps()).db).some((l) => l.id === id)).toBe(true);
    } finally {
      delete holder.__presentkortDeps;
    }
  });
});
