import { describe, expect, it } from "vitest";
import { listings } from "@/db/schema";
import { FixedClock } from "@/domain/clock";
import { type PublishInput, publishListing } from "@/domain/listings";
import { makeTestDeps, spyOnVerifier, userId } from "../helpers";

const valid: PublishInput = {
  merchantId: "NK",
  giftCardCode: "NK-7001",
  balance: 1000,
  price: 850,
  validUntil: "2027-11-17",
};

const BOUNDS = /större än 0 kr och lägre än saldot 1\s000 kr/;

describe("publish validation", () => {
  it("price rule, past date and malformed input are refused before the check", async () => {
    const deps = makeTestDeps();
    const sara = userId(deps.db, "Sara");
    const spy = spyOnVerifier(deps);
    const listingCount = () => deps.db.select().from(listings).all().length;
    const before = listingCount();

    const refusals: [Partial<PublishInput>, string, RegExp][] = [
      // Prisregeln (0 < pris < saldo)
      [{ price: 0 }, "price", BOUNDS],
      [{ price: 1000 }, "price", BOUNDS],
      [{ price: 1200 }, "price", BOUNDS],
      // Ofullständiga uppgifter
      [{ giftCardCode: "" }, "giftCardCode", /presentkortskoden/],
      [{ giftCardCode: "   " }, "giftCardCode", /presentkortskoden/],
      [{ merchantId: "XX" }, "merchantId", /handlare/],
      [{ balance: 999.5 }, "balance", /saldot i hela kronor/],
      [{ balance: Number.NaN }, "balance", /saldot i hela kronor/],
      [{ price: 849.5 }, "price", /priset i hela kronor/],
      [{ price: Number.NaN }, "price", /priset i hela kronor/],
      [{ validUntil: "" }, "validUntil", /giltighetsdatum/],
      [{ validUntil: "2027-02-30" }, "validUntil", /giltighetsdatum/],
      // Passerat giltighetsdatum
      [{ validUntil: "2026-11-16" }, "validUntil", /har passerat/],
    ];
    for (const [change, field, message] of refusals) {
      await expect(publishListing(deps, sara, { ...valid, ...change }), JSON.stringify(change)).rejects.toMatchObject({
        code: "invalid_input",
        field,
        message: expect.stringMatching(message),
      });
    }
    expect(listingCount()).toBe(before);
    expect(spy.calls).toHaveLength(0);

    // Boundary acceptance: pris 999 kr under saldo 1 000 kr.
    await expect(publishListing(deps, sara, { ...valid, price: 999 })).resolves.toBeTypeOf("number");
    expect(listingCount()).toBe(before + 1);
  });

  it("today's giltighetsdatum is valid to the end of the day in Swedish time", async () => {
    const lateEvening = makeTestDeps();
    lateEvening.clock = new FixedClock("2026-11-17T23:30:00+01:00");
    const sara = userId(lateEvening.db, "Sara");
    await expect(publishListing(lateEvening, sara, { ...valid, validUntil: "2026-11-17" })).resolves.toBeTypeOf(
      "number",
    );

    // 00:30 Swedish time on the 18th is still the 17th in UTC: Swedish time decides.
    const afterMidnight = makeTestDeps();
    afterMidnight.clock = new FixedClock("2026-11-18T00:30:00+01:00");
    await expect(
      publishListing(afterMidnight, sara, { ...valid, validUntil: "2026-11-17" }),
    ).rejects.toMatchObject({ code: "invalid_input", field: "validUntil" });
  });
});
