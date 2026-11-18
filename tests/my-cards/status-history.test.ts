import { describe, expect, it } from "vitest";
import { formatStockholmTimestamp } from "@/domain/dates";
import { editListing, getListingPage } from "@/domain/listings";
import { deliverPurchase, getPurchasePage, startPurchase } from "@/domain/purchases";
import { authorizeDirectly, makeTestDeps, publishNk, userId } from "../helpers";

/**
 * Scenario S03: Sara publishes at 12:00:00 and changes the pris at 12:00:02; Kalle's köp goes
 * Påbörjat 12:00:05 → Betalning auktoriserad 12:00:20 → Levererat 12:00:21 on 2026-11-17.
 */
async function historyFixture() {
  const deps = makeTestDeps();
  const [sara, kalle, lisa] = (["Sara", "Kalle", "Lisa"] as const).map((n) => userId(deps.db, n));
  const listingId = await publishNk(deps);
  deps.clock.advance(2_000);
  await editListing(deps, sara, listingId, { price: 800 });
  deps.clock.advance(3_000);
  const purchaseId = startPurchase(deps, kalle, listingId);
  deps.clock.advance(15_000);
  await authorizeDirectly(deps, purchaseId);
  deps.clock.advance(1_000);
  const outcome = await deliverPurchase(deps, purchaseId);
  if (outcome.kind !== "delivered") throw new Error(`expected leverans, got ${outcome.kind}`);
  return { deps, sara, kalle, lisa, listingId, purchaseId };
}

const shown = (rows: { at: Date; status: string; reason: string }[]) =>
  rows.map((r) => [formatStockholmTimestamp(r.at), r.status, r.reason]);

describe("statushistorik", () => {
  it("owner sees history with swedish time and others receive none", async () => {
    const { deps, sara, kalle, lisa, listingId, purchaseId } = await historyFixture();

    // Kalle's köp, oldest first, tidpunkt in Swedish time, status and orsak – no aktör.
    const purchase = getPurchasePage(deps, kalle, purchaseId);
    expect(shown(purchase.history)).toEqual([
      ["2026-11-17 12:00:05", "Påbörjat", "belopp låst till 800 kr"],
      ["2026-11-17 12:00:20", "Betalning auktoriserad", "betalning auktoriserad (simulerat)"],
      ["2026-11-17 12:00:21", "Levererat", "kontrollerad vid köp (simulerat), betalning dragen och kod levererad"],
    ]);
    expect(purchase.history.every((r) => !("actor" in r))).toBe(true);

    // Sara's annons from publicering through Såld, the edit row included.
    const own = getListingPage(deps, sara, listingId);
    expect(own?.own).toBe(true);
    expect(own?.own && shown(own.history)).toEqual([
      ["2026-11-17 12:00:00", "Aktiv", "kontrollerad vid publicering (simulerat)"],
      ["2026-11-17 12:00:02", "Aktiv", "ändrad: pris 850 kr → 800 kr"],
      ["2026-11-17 12:00:05", "Reserverad", "reserverad i 5 min"],
      ["2026-11-17 12:00:21", "Såld", "såld"],
    ]);

    // Scenario S04: Kalle and Lisa receive no annons statushistorik; Lisa's köp request is refused.
    for (const viewer of [kalle, lisa]) {
      const page = getListingPage(deps, viewer, listingId)!;
      expect(page.own).toBe(false);
      const serialized = JSON.stringify(page);
      expect(serialized).not.toContain("history");
      expect(serialized).not.toContain("reserverad i 5 min");
      expect(serialized).not.toContain("NK-4471-9920");
    }
    expect(() => getPurchasePage(deps, lisa, purchaseId)).toThrow(expect.objectContaining({ code: "forbidden" }));
  });
});
