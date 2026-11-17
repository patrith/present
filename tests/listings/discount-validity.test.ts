import { describe, expect, it } from "vitest";
import { FixedClock } from "@/domain/clock";
import { endOfValidity } from "@/domain/dates";
import { listingTerms } from "@/domain/listing-terms";

const at = (validUntil: string, balance = 1000, price = 850) => ({ balance, price, validUntil, status: "active" as const });

describe("listing terms", () => {
  it("discount and remaining validity follow the documented rules", () => {
    const now = new FixedClock("2026-11-17T12:00:00+01:00").now();

    expect(listingTerms(at("2027-11-17"), now)).toMatchObject({ discountKr: 150, discountPct: 15, checkStatus: "verified" });
    // Whole procent, rounded half up: 12.5 % gives 13 %, 12.4 % gives 12 %.
    expect(listingTerms(at("2027-11-17", 200, 175), now).discountPct).toBe(13);
    expect(listingTerms(at("2027-11-17", 500, 438), now).discountPct).toBe(12);

    // 6.5 days to the end of 2026-11-23 warns; 7.5 days to the end of 2026-11-24 does not.
    expect(listingTerms(at("2026-11-23"), now).shortValidity).toBe(true);
    expect(listingTerms(at("2026-11-24"), now).shortValidity).toBe(false);

    // Giltighetsdatum ends at 00:00 Swedish time the next day, across both DST changes.
    expect(endOfValidity("2026-11-23").toISOString()).toBe("2026-11-23T23:00:00.000Z");
    expect(endOfValidity("2027-03-28").toISOString()).toBe("2027-03-28T22:00:00.000Z");
    expect(endOfValidity("2027-10-31").toISOString()).toBe("2027-10-31T23:00:00.000Z");
    expect(endOfValidity("2027-06-30").toISOString()).toBe("2027-06-30T22:00:00.000Z");
  });
});
