import { afterEach, describe, expect, it, vi } from "vitest";
import { advanceDemoClock } from "@/domain/demo-clock";
import { expireDue } from "@/domain/expire-due";
import { startPurchase } from "@/domain/purchases";
import { register } from "@/instrumentation";
import { SWEEP_INTERVAL_MS, stopSweep } from "@/server/sweep";
import { forceListingStatus, listingRow, makeTestDeps, publishNk, purchaseRow, userId } from "../helpers";

// expireDue as the real function, wrapped so a test can read the `now` each call was given.
vi.mock("@/domain/expire-due", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/domain/expire-due")>();
  return { ...original, expireDue: vi.fn(original.expireDue) };
});

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

  it("sweep expires a listing past its validity without any read", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const deps = makeTestDeps();
    holder.__presentkortDeps = deps;
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    const listingId = await publishNk(deps);
    forceListingStatus(deps.db, listingId, "active", { validUntil: "2026-11-17" });
    await register();

    // Midnight Swedish time passes and nobody reads anything: one tick later the annons is Utgången.
    deps.clock.advance(new Date("2026-11-18T00:00:00+01:00").getTime() - deps.clock.now().getTime());
    expect(listingRow(deps.db, listingId).status).toBe("active");
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS);
    expect(listingRow(deps.db, listingId).status).toBe("expired");
  });

  it("sweep sees the advanced demo clock", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const deps = makeTestDeps();
    holder.__presentkortDeps = deps;
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    await register();

    await advanceDemoClock(deps, 24 * 60 * 60_000);
    const advanced = new Date("2026-11-18T12:00:00+01:00");
    vi.mocked(expireDue).mockClear();
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS);
    expect(vi.mocked(expireDue)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(expireDue).mock.calls[0][1]).toEqual(advanced);
  });

  it("does not start outside the Node.js runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    await register();
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });
});
