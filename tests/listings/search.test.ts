import { describe, expect, it } from "vitest";
import { getListing, searchListings } from "@/domain/listings";
import { makeTestDeps, publishNk } from "../helpers";

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
});
