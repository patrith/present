import type { Clock } from "./clock";
import { formatStockholmDateTime } from "./dates";
import type { Deps } from "./deps";
import { DomainError } from "./errors";
import { expireDue } from "./expire-due";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A clock the demo panel can move forward (the demoläge OffsetClock, or a test's FixedClock). */
type MovableClock = Clock & { advance(ms: number): void };

function isMovable(clock: Clock): clock is MovableClock {
  return typeof (clock as Partial<MovableClock>).advance === "function";
}

/** The demo panel's steps, forward only (FR10: "flytta fram"). */
export const DEMO_STEPS = [
  { id: "1m", label: "+1 min", ms: MINUTE },
  { id: "5m", label: "+5 min", ms: 5 * MINUTE },
  { id: "1d", label: "+1 dag", ms: DAY },
] as const;

export type DemoStepId = (typeof DEMO_STEPS)[number]["id"];

/**
 * Moves the simulated klocka forward by `ms` and applies every time rule due at the new time
 * (ADR-005 call path 3) before returning it. Refused, with the clock unchanged, outside demoläge
 * and for a step that is not a positive number of milliseconds.
 */
export async function advanceDemoClock(deps: Deps, ms: number): Promise<Date> {
  const { clock } = deps;
  if (!deps.config.demoMode || !isMovable(clock)) {
    throw new DomainError("forbidden", "Den simulerade klockan kan bara flyttas i demoläge.");
  }
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new DomainError("invalid_input", "Den simulerade klockan kan bara flyttas framåt.");
  }
  clock.advance(ms);
  const now = clock.now();
  await expireDue(deps, now);
  return now;
}

/** What the demo panel shows: the simulated time and the configured times, read from config. */
export type DemoPanelData = {
  /** Swedish time, date and HH:MM, e.g. "2026-11-17 12:05". */
  simulatedTime: string;
  /** e.g. "Reservation 5 min · reklamationsperiod 24 h". */
  configLine: string;
  steps: readonly { id: DemoStepId; label: string }[];
};

/** The demo panel's data in demoläge; undefined (no panel) otherwise. */
export function getDemoPanel(deps: Pick<Deps, "clock" | "config">): DemoPanelData | undefined {
  if (!deps.config.demoMode) return undefined;
  const reservation = `${deps.config.reservationMs / MINUTE} min`;
  const claimPeriod = `${deps.config.claimPeriodMs / HOUR} h`;
  return {
    simulatedTime: formatStockholmDateTime(deps.clock.now()),
    configLine: `Reservation ${reservation} · reklamationsperiod ${claimPeriod}`,
    steps: DEMO_STEPS.map(({ id, label }) => ({ id, label })),
  };
}

/** The step's length for a panel step id; undefined for anything else. */
export function demoStepMs(id: string): number | undefined {
  return DEMO_STEPS.find((s) => s.id === id)?.ms;
}
