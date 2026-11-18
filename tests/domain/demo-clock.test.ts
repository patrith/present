import { describe, expect, it } from "vitest";
import { systemClock } from "@/domain/clock";
import { loadConfig } from "@/domain/config";
import { advanceDemoClock, getDemoPanel } from "@/domain/demo-clock";
import { publishListing } from "@/domain/listings";
import { startPurchase } from "@/domain/purchases";
import { historyCount, listingRow, publishNk, purchaseRow } from "../helpers";
import { deliveredPurchase, payoutOf } from "../purchases/delivered";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/**
 * Scenario S06's Given at 12:00:00 Swedish time: a Påbörjat köp reserved until 12:05:00, a köp
 * Levererat at 12:00:00, and an Aktiv annons with giltighetsdatum 2026-11-17.
 */
async function demoFixtures() {
  const { deps, sara, kalle, purchaseId: deliveredId } = await deliveredPurchase(undefined, "NK-DELIVERED-1");
  const reservedListingId = await publishNk(deps, "NK-RESERVED-1");
  const startedId = startPurchase(deps, kalle, reservedListingId);
  const todayListingId = await publishListing(deps, sara, {
    merchantId: "ICA",
    giftCardCode: "ICA-TODAY-1",
    balance: 500,
    price: 400,
    validUntil: "2026-11-17",
  });
  return { deps, sara, deliveredId, reservedListingId, startedId, todayListingId };
}

describe("demo clock", () => {
  it("advance applies every time rule immediately and only forward in demo mode", async () => {
    const f = await demoFixtures();
    const { deps } = f;
    expect(deps.clock.now()).toEqual(new Date("2026-11-17T12:00:00+01:00"));
    const configBefore = { ...deps.config };

    // "+5 min": the reservation runs out at 12:05:00 – applied before any sweep tick.
    await advanceDemoClock(deps, 5 * MINUTE);
    expect(purchaseRow(deps, f.startedId)).toMatchObject({ status: "failed", failureReason: "reservationen gick ut" });
    expect(listingRow(deps.db, f.reservedListingId).status).toBe("active");
    expect(purchaseRow(deps, f.deliveredId).status).toBe("delivered");
    expect(listingRow(deps.db, f.todayListingId).status).toBe("active");
    expect(getDemoPanel(deps)?.simulatedTime).toBe("2026-11-17 12:05");

    // "+1 dag": the reklamationsperiod lapses (credit once) and the giltighet ends.
    const payoutBefore = payoutOf(deps, f.sara);
    await advanceDemoClock(deps, DAY);
    expect(purchaseRow(deps, f.deliveredId).status).toBe("completed");
    expect(payoutOf(deps, f.sara)).toBe(payoutBefore + 850);
    expect(listingRow(deps.db, f.todayListingId).status).toBe("expired");
    expect(listingRow(deps.db, f.reservedListingId).status).toBe("active");
    expect(getDemoPanel(deps)?.simulatedTime).toBe("2026-11-18 12:05");
    expect(deps.config).toEqual(configBefore);
    expect(getDemoPanel(deps)?.configLine).toBe("Reservation 5 min · reklamationsperiod 24 h");

    // Refused in demoläge: a zero, negative or non-numeric step leaves the clock and data unchanged.
    const at = deps.clock.now().getTime();
    const rows = historyCount(deps);
    for (const step of [0, -MINUTE, Number.NaN]) {
      await expect(advanceDemoClock(deps, step)).rejects.toMatchObject({ code: "invalid_input" });
    }
    expect(deps.clock.now().getTime()).toBe(at);
    expect(historyCount(deps)).toBe(rows);
    expect(payoutOf(deps, f.sara)).toBe(payoutBefore + 850);

    // Demoläge off: any move is refused and the clock is system time.
    const off = loadConfig({ DEMO_MODE: "false" });
    await expect(advanceDemoClock({ ...deps, clock: systemClock, config: off }, 5 * MINUTE)).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(Math.abs(systemClock.now().getTime() - Date.now())).toBeLessThan(1_000);
    // Even a movable clock is not moved while demoläge is off.
    await expect(advanceDemoClock({ ...deps, config: off }, DAY)).rejects.toMatchObject({ code: "forbidden" });
    expect(deps.clock.now().getTime()).toBe(at);
    expect(getDemoPanel({ clock: deps.clock, config: off })).toBeUndefined();
  });
});
