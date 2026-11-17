import { afterEach, describe, expect, it, vi } from "vitest";
import { startPurchase } from "@/domain/purchases";
import { register } from "@/instrumentation";
import { SWEEP_INTERVAL_MS, stopSweep } from "@/server/sweep";
import { listingRow, makeTestDeps, publishNk, purchaseRow, userId } from "../helpers";

const holder = globalThis as typeof globalThis & { __presentkortDeps?: unknown };

afterEach(() => {
  stopSweep();
  delete holder.__presentkortDeps;
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("sweep", () => {
  it("sweep expires a reservation without any read and starts once", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const deps = makeTestDeps();
    holder.__presentkortDeps = deps; // what getDeps() returns in the app
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

    const listingId = await publishNk(deps);
    const purchaseId = startPurchase(deps, userId(deps.db, "Kalle"), listingId);

    await register();
    await register();
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    // Past reserved_until, nobody reads anything: one tick later the annons is Aktiv again.
    deps.clock.advance(5 * 60_000 + 1);
    expect(listingRow(deps.db, listingId).status).toBe("reserved");
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS);
    expect(listingRow(deps.db, listingId).status).toBe("active");
    expect(purchaseRow(deps, purchaseId)).toMatchObject({ status: "failed", failureReason: "reservationen gick ut" });
  });

  it("does not start outside the Node.js runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    await register();
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });
});
