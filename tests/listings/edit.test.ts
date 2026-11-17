import { describe, expect, it } from "vitest";
import { editListing, getListing, searchListings } from "@/domain/listings";
import {
  forceListingStatus,
  listingHistory,
  listingRow,
  makeTestDeps,
  publishNk,
  spyOnVerifier,
  userId,
} from "../helpers";

const BOUNDS = /större än 0 kr och lägre än saldot/;

describe("edit listing", () => {
  it("price change on an active listing", async () => {
    const deps = makeTestDeps();
    const sara = userId(deps.db, "Sara");
    const id = await publishNk(deps, "NK-4471");
    const spy = spyOnVerifier(deps);
    deps.clock.advance(60_000);

    await editListing(deps, sara, id, { price: 800 });

    expect(listingRow(deps.db, id)).toMatchObject({ status: "active", price: 800, balance: 1000 });
    const history = listingHistory(deps.db, id);
    expect(history).toHaveLength(2);
    expect(history[1]).toMatchObject({
      fromStatus: "active",
      toStatus: "active",
      actorUserId: sara,
      at: deps.clock.now(),
      reason: expect.stringMatching(/pris 850 kr → 800 kr/),
    });
    // Kalle's sökning and annons view show the new pris.
    expect(searchListings(deps, userId(deps.db, "Kalle")).find((l) => l.id === id)).toMatchObject({ price: 800 });
    expect(getListing(deps.db, id)).toMatchObject({ price: 800 });
    expect(spy.calls).toHaveLength(0);

    for (const price of [0, 1000]) {
      await expect(editListing(deps, sara, id, { price })).rejects.toMatchObject({
        code: "invalid_input",
        field: "price",
        message: expect.stringMatching(BOUNDS),
      });
    }
    expect(listingRow(deps.db, id).price).toBe(800);
    expect(listingHistory(deps.db, id)).toHaveLength(2);
    expect(spy.calls).toHaveLength(0);
  });

  it("code or balance change is rechecked and saved only when approved", async () => {
    const deps = makeTestDeps();
    const sara = userId(deps.db, "Sara");
    const spy = spyOnVerifier(deps);

    // Scenario S07, approved: code change, then saldo change, each checked at publicering phase.
    const active = await publishNk(deps, "NK-4471");
    spy.calls.length = 0;
    await editListing(deps, sara, active, { giftCardCode: "NK-4472" });
    await editListing(deps, sara, active, { balance: 900 });
    expect(spy.calls).toEqual([
      { code: "NK-4472", declaredBalance: 1000, phase: "publish" },
      { code: "NK-4472", declaredBalance: 900, phase: "publish" },
    ]);
    expect(listingRow(deps.db, active)).toMatchObject({
      status: "active",
      giftCardCode: "NK-4472",
      balance: 900,
      price: 850,
    });
    expect(listingHistory(deps.db, active).slice(1)).toMatchObject([
      { fromStatus: "active", toStatus: "active", actorUserId: sara },
      { fromStatus: "active", toStatus: "active", actorUserId: sara },
    ]);

    // Scenario S07, refused: each outcome keeps the earlier values and status.
    const kept = await publishNk(deps, "NK-5471");
    const keptRow = listingRow(deps.db, kept);
    const refusals: [Parameters<typeof editListing>[3], RegExp][] = [
      [{ giftCardCode: "OGILTIG-9" }, /godkände inte presentkortskoden/],
      [{ giftCardCode: "SALDO-9" }, /saldot 800 kr, inte 1\s000 kr/],
      [{ giftCardCode: "TIMEOUT-9" }, /kunde inte genomföras/],
      [{ giftCardCode: "FEL-9" }, /kunde inte genomföras/],
      [{ balance: 800 }, BOUNDS],
    ];
    for (const [changes, message] of refusals) {
      await expect(editListing(deps, sara, kept, changes), JSON.stringify(changes)).rejects.toMatchObject({
        message: expect.stringMatching(message),
      });
    }
    expect(listingRow(deps.db, kept)).toEqual(keptRow);
    expect(listingHistory(deps.db, kept)).toHaveLength(1);

    // Scenario S08: a Flaggad DELVIS annons is corrected to saldo 800 kr, pris 700 kr.
    const flagged = await publishNk(deps, "DELVIS-4471");
    forceListingStatus(deps.db, flagged, "flagged", { flagReason: "saldoavvikelse" });
    expect(searchListings(deps, userId(deps.db, "Kalle")).some((l) => l.id === flagged)).toBe(false);
    await editListing(deps, sara, flagged, { balance: 800, price: 700 });
    expect(listingRow(deps.db, flagged)).toMatchObject({
      status: "active",
      balance: 800,
      price: 700,
      flagReason: null,
    });
    expect(listingHistory(deps.db, flagged).at(-1)).toMatchObject({
      fromStatus: "flagged",
      toStatus: "active",
      actorUserId: sara,
    });
    expect(searchListings(deps, userId(deps.db, "Kalle")).find((l) => l.id === flagged)).toMatchObject({ balance: 800, price: 700 });

    // Scenario S08, not approved: stays Flaggad with its earlier values.
    const stillFlagged = await publishNk(deps, "NK-6471");
    forceListingStatus(deps.db, stillFlagged, "flagged", { flagReason: "saldoavvikelse" });
    const flaggedRow = listingRow(deps.db, stillFlagged);
    await expect(
      editListing(deps, sara, stillFlagged, { giftCardCode: "OGILTIG-6471", balance: 800, price: 700 }),
    ).rejects.toMatchObject({ code: "verification_failed" });
    expect(listingRow(deps.db, stillFlagged)).toEqual(flaggedRow);

    // Scenario S09: pris alone on a Flaggad annons is refused with a hint to correct code or saldo.
    const historyBefore = listingHistory(deps.db, stillFlagged).length;
    await expect(editListing(deps, sara, stillFlagged, { price: 700 })).rejects.toMatchObject({
      code: "invalid_input",
      message: expect.stringMatching(/Rätta presentkortskoden eller saldot/),
    });
    expect(listingRow(deps.db, stillFlagged)).toEqual(flaggedRow);
    expect(listingHistory(deps.db, stillFlagged)).toHaveLength(historyBefore);
  });
});
