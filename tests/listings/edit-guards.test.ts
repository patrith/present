import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { purchases } from "@/db/schema";
import { editListing, withdrawListing } from "@/domain/listings";
import { startPurchase } from "@/domain/purchases";
import { refusal } from "@/server/actions/result";
import { forceListingStatus, listingHistory, listingRow, makeTestDeps, publishNk, userId } from "../helpers";
import type { TestDeps } from "../helpers";

/** Every change the säljare can attempt: pris, code, saldo, återkallelse. */
function attempts(deps: TestDeps, actor: number, id: number): [string, () => Promise<unknown>][] {
  return [
    ["pris", () => editListing(deps, actor, id, { price: 800 })],
    ["kod", () => editListing(deps, actor, id, { giftCardCode: "NK-9999" })],
    ["saldo", () => editListing(deps, actor, id, { balance: 900 })],
    ["återkalla", async () => withdrawListing(deps, actor, id)],
  ];
}

describe("edit guards", () => {
  it("no change while reserved or after", async () => {
    const deps = makeTestDeps();
    const sara = userId(deps.db, "Sara");
    const kalle = userId(deps.db, "Kalle");

    const reserved = await publishNk(deps, "NK-7101");
    const purchaseId = startPurchase(deps, kalle, reserved);
    const sold = await publishNk(deps, "NK-7102");
    forceListingStatus(deps.db, sold, "sold");
    const expired = await publishNk(deps, "NK-7103");
    forceListingStatus(deps.db, expired, "expired");
    const withdrawn = await publishNk(deps, "NK-7104");
    withdrawListing(deps, sara, withdrawn);

    const purchaseBefore = deps.db.select().from(purchases).where(eq(purchases.id, purchaseId)).get();
    for (const [id, label] of [
      [reserved, "Reserverad"],
      [sold, "Såld"],
      [expired, "Utgången"],
      [withdrawn, "Återkallad"],
    ] as const) {
      const rowBefore = listingRow(deps.db, id);
      const historyBefore = listingHistory(deps.db, id).length;
      for (const [what, attempt] of attempts(deps, sara, id)) {
        await expect(attempt(), `${what} on ${label}`).rejects.toMatchObject({
          code: "listing_locked",
          message: expect.stringContaining(`status ${label}`),
        });
      }
      expect(listingRow(deps.db, id)).toEqual(rowBefore);
      expect(listingHistory(deps.db, id)).toHaveLength(historyBefore);
    }
    expect(listingRow(deps.db, reserved)).toMatchObject({ status: "reserved", reservedById: kalle });
    expect(deps.db.select().from(purchases).where(eq(purchases.id, purchaseId)).get()).toEqual(purchaseBefore);

    // Race: Kalle's reservation commits while Sara's code change awaits the butikskontroll.
    const racing = await publishNk(deps, "NK-7105");
    const inner = deps.verifier;
    let racePurchase: number | undefined;
    deps.verifier = {
      verify: async (request) => {
        racePurchase = startPurchase(deps, kalle, racing);
        return inner.verify(request);
      },
    };
    await expect(editListing(deps, sara, racing, { giftCardCode: "NK-7106" })).rejects.toMatchObject({
      code: "listing_locked",
      message: expect.stringContaining("status Reserverad"),
    });
    expect(racePurchase).toBeTypeOf("number");
    expect(listingRow(deps.db, racing)).toMatchObject({
      status: "reserved",
      reservedById: kalle,
      giftCardCode: "NK-7105",
      price: 850,
      balance: 1000,
    });
    expect(deps.db.select().from(purchases).where(eq(purchases.id, racePurchase!)).get()).toMatchObject({
      status: "started",
      amount: 850,
    });
  });

  it("a concurrent edit of the same annons is refused, not applied twice", async () => {
    const deps = makeTestDeps();
    const sara = userId(deps.db, "Sara");
    const id = await publishNk(deps, "NK-7201");
    const inner = deps.verifier;
    // A butikskontroll slow enough for both edits to read the annons before either writes.
    deps.verifier = {
      verify: async (request) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return inner.verify(request);
      },
    };

    const results = await Promise.allSettled([
      editListing(deps, sara, id, { balance: 900 }),
      editListing(deps, sara, id, { balance: 950, price: 700 }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "listing_locked", message: expect.stringContaining("ändrades samtidigt") },
    });
    // Exactly one change row, and the row holds what that change says.
    expect(listingHistory(deps.db, id)).toHaveLength(2);
    const row = listingRow(deps.db, id);
    expect(listingHistory(deps.db, id).at(-1)!.reason).toMatch(new RegExp(`saldo .+ → ${row.balance} kr`));
  });

  it("only the seller may edit or withdraw", async () => {
    const deps = makeTestDeps();
    const sara = userId(deps.db, "Sara");
    const kalle = userId(deps.db, "Kalle");
    const id = await publishNk(deps, "NK-4471");
    const rowBefore = listingRow(deps.db, id);

    const refusals: unknown[] = [];
    for (const [what, attempt] of [...attempts(deps, kalle, id), ...attempts(deps, sara, 999_999)]) {
      const error = await attempt().then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(error, what).toMatchObject({ code: "not_found" });
      refusals.push(refusal(error));
    }
    // One indistinguishable answer for someone else's annons and an unknown one.
    expect(new Set(refusals.map((r) => JSON.stringify(r))).size).toBe(1);
    expect(JSON.stringify(refusals)).not.toContain("NK-4471");
    expect(listingRow(deps.db, id)).toEqual(rowBefore);
    expect(listingHistory(deps.db, id)).toHaveLength(1);
  });
});
