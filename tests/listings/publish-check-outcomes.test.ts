import { describe, expect, it } from "vitest";
import { listings } from "@/db/schema";
import { type PublishInput, publishListing } from "@/domain/listings";
import { listingRow, makeTestDeps, userId } from "../helpers";

const input = (giftCardCode: string, balance = 1000, price = 850): PublishInput => ({
  merchantId: "NK",
  giftCardCode,
  balance,
  price,
  validUntil: "2027-11-17",
});

const NOT_COMPLETED = /kunde inte genomföras.*försök igen/i;

describe("publish check outcomes", () => {
  it("each rejecting check outcome gives its reason and creates nothing", async () => {
    const deps = makeTestDeps();
    const sara = userId(deps.db, "Sara");
    const count = () => deps.db.select().from(listings).all().length;
    const before = count();

    const cases: [string, RegExp, string | undefined][] = [
      ["OGILTIG-1", /godkände inte presentkortskoden/, "giftCardCode"],
      ["SALDO-1", /saldot 800 kr, inte 1\s000 kr/, "balance"],
      ["TIMEOUT-1", NOT_COMPLETED, undefined],
      ["FEL-1", NOT_COMPLETED, undefined],
    ];
    for (const [code, message, field] of cases) {
      const refusal = await publishListing(deps, sara, input(code)).catch((e: unknown) => e);
      expect(refusal, code).toMatchObject({ code: "verification_failed", field, message: expect.stringMatching(message) });
      expect((refusal as Error).message, code).toMatch(/\(simulerat\)/);
    }
    expect(count()).toBe(before);

    // The controlled saldo lets Sara correct it: the same SALDO code with 800 kr publishes as Aktiv,
    // and is not refused as a duplicate since no annons held it.
    const id = await publishListing(deps, sara, input("SALDO-1", 800, 700));
    expect(listingRow(deps.db, id)).toMatchObject({ status: "active", balance: 800, price: 700 });

    // Neither is a code refused as ogiltig.
    await expect(publishListing(deps, sara, input("OGILTIG-1"))).rejects.toMatchObject({ code: "verification_failed" });
  });

  it("a check unanswered within the configured timeout counts as no response", async () => {
    const deps = makeTestDeps();
    deps.config = { ...deps.config, verifierTimeoutMs: 30 };
    deps.verifier = { verify: () => new Promise(() => {}) };
    const sara = userId(deps.db, "Sara");
    const before = deps.db.select().from(listings).all().length;

    await expect(publishListing(deps, sara, input("NK-SLOW-1"))).rejects.toMatchObject({
      code: "verification_failed",
      message: expect.stringMatching(NOT_COMPLETED),
    });
    expect(deps.db.select().from(listings).all()).toHaveLength(before);
  });
});
