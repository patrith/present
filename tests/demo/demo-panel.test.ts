import { describe, expect, it } from "vitest";
import { FixedClock } from "@/domain/clock";
import { loadConfig } from "@/domain/config";
import { getDemoPanel } from "@/domain/demo-clock";

describe("demo panel", () => {
  it("panel data shows simulated time and config only in demo mode", () => {
    const clock = new FixedClock("2026-11-17T12:05:00+01:00");
    const panel = getDemoPanel({ clock, config: loadConfig({}) });
    expect(panel).toEqual({
      simulatedTime: "2026-11-17 12:05",
      configLine: "Reservation 5 min · reklamationsperiod 24 h",
      steps: [
        { id: "1m", label: "+1 min" },
        { id: "5m", label: "+5 min" },
        { id: "1d", label: "+1 dag" },
      ],
    });
    // The config line reads the configured times, not constants.
    const custom = getDemoPanel({ clock, config: loadConfig({ RESERVATION_MINUTES: "2", CLAIM_PERIOD_HOURS: "1" }) });
    expect(custom?.configLine).toBe("Reservation 2 min · reklamationsperiod 1 h");

    expect(getDemoPanel({ clock, config: loadConfig({ DEMO_MODE: "false" }) })).toBeUndefined();
  });
});
