import { describe, expect, it } from "vitest";
import { endOfValidity, isPastValidity } from "@/domain/dates";
import { expireDue } from "@/domain/expire-due";
import { forceListingStatus, listingRow, makeTestDeps, publishNk } from "../helpers";

const second = 1_000;

describe("giltighetsdatum end", () => {
  it("giltighetsdatum ends at midnight swedish time across dst", async () => {
    // Scenario S03: summer time ends the day at 22:00Z, winter time at 23:00Z.
    expect(endOfValidity("2027-06-30").toISOString()).toBe("2027-06-30T22:00:00.000Z");
    expect(endOfValidity("2027-01-15").toISOString()).toBe("2027-01-15T23:00:00.000Z");
    // DST change days: 2026-10-25 (back to winter time, a 25-hour day), 2027-03-28 (to summer time, 23 hours).
    expect(endOfValidity("2026-10-25").toISOString()).toBe("2026-10-25T23:00:00.000Z");
    expect(endOfValidity("2026-10-24").toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(endOfValidity("2027-03-28").toISOString()).toBe("2027-03-28T22:00:00.000Z");
    expect(endOfValidity("2027-03-27").toISOString()).toBe("2027-03-27T23:00:00.000Z");

    const instants = [
      { validUntil: "2027-06-30", before: "2027-06-30T21:59:59Z", after: "2027-06-30T22:00:00Z" },
      { validUntil: "2027-01-15", before: "2027-01-15T22:59:59Z", after: "2027-01-15T23:00:00Z" },
      { validUntil: "2026-10-25", before: "2026-10-25T22:59:59Z", after: "2026-10-25T23:00:00Z" },
      { validUntil: "2027-03-28", before: "2027-03-28T21:59:59Z", after: "2027-03-28T22:00:00Z" },
    ];
    for (const { validUntil, before, after } of instants) {
      expect(isPastValidity(validUntil, new Date(before)), `${validUntil} at ${before}`).toBe(false);
      expect(isPastValidity(validUntil, new Date(after)), `${validUntil} at ${after}`).toBe(true);
    }

    // The same instants through expireDue: Aktiv at the first, Utgången at the second.
    for (const { validUntil, before, after } of instants.slice(0, 2)) {
      const deps = makeTestDeps();
      const listingId = await publishNk(deps);
      forceListingStatus(deps.db, listingId, "active", { validUntil });
      await expireDue(deps, new Date(before));
      expect(listingRow(deps.db, listingId).status, `${validUntil} at ${before}`).toBe("active");
      await expireDue(deps, new Date(new Date(before).getTime() + second));
      expect(new Date(new Date(before).getTime() + second).toISOString()).toBe(new Date(after).toISOString());
      expect(listingRow(deps.db, listingId).status, `${validUntil} at ${after}`).toBe("expired");
    }
  });
});
