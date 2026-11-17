import { describe, expect, it } from "vitest";
import { searchListings, withdrawListing } from "@/domain/listings";
import { forceListingStatus, listingHistory, listingRow, makeTestDeps, publishNk, userId } from "../helpers";

describe("withdraw listing", () => {
  it("active and flagged listings can be withdrawn", async () => {
    const deps = makeTestDeps();
    const sara = userId(deps.db, "Sara");
    const active = await publishNk(deps, "NK-8001");
    const flagged = await publishNk(deps, "NK-8002");
    forceListingStatus(deps.db, flagged, "flagged", { flagReason: "ogiltig kod" });
    expect(searchListings(deps.db).some((l) => l.id === active)).toBe(true);

    for (const [id, from] of [
      [active, "active"],
      [flagged, "flagged"],
    ] as const) {
      withdrawListing(deps, sara, id);
      expect(listingRow(deps.db, id).status).toBe("withdrawn");
      expect(listingHistory(deps.db, id).at(-1)).toMatchObject({
        fromStatus: from,
        toStatus: "withdrawn",
        actorUserId: sara,
        at: deps.clock.now(),
      });
      expect(searchListings(deps.db).some((l) => l.id === id)).toBe(false);
    }
  });
});
