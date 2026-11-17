import { describe, expect, it } from "vitest";
import { loadConfig } from "@/domain/config";

describe("config", () => {
  it("times default to 5 min and 24 h and follow environment overrides", () => {
    const defaults = loadConfig({});
    expect(defaults.reservationMs).toBe(5 * 60_000);
    expect(defaults.claimPeriodMs).toBe(24 * 3_600_000);
    expect(defaults.loginCodeValidityMs).toBe(10 * 60_000);
    expect(defaults.demoMode).toBe(true);

    const overridden = loadConfig({
      RESERVATION_MINUTES: "2",
      CLAIM_PERIOD_HOURS: "1",
      LOGIN_CODE_MINUTES: "3",
      DEMO_MODE: "false",
    });
    expect(overridden.reservationMs).toBe(2 * 60_000);
    expect(overridden.claimPeriodMs).toBe(3_600_000);
    expect(overridden.loginCodeValidityMs).toBe(3 * 60_000);
    expect(overridden.demoMode).toBe(false);

    expect(() => loadConfig({ RESERVATION_MINUTES: "zero" })).toThrow(/RESERVATION_MINUTES/);
  });
});
