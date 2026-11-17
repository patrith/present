import type { Deps } from "@/domain/deps";
import { expireDue } from "@/domain/expire-due";

export const SWEEP_INTERVAL_MS = 1_000;

// On globalThis so dev hot reload, or a second register(), never starts a second interval.
const holder = globalThis as typeof globalThis & { __presentkortSweep?: ReturnType<typeof setInterval> };

/**
 * The sweep (ADR-005 call path 2): applies every due time rule each second, so a status changes
 * even when nobody is looking. Starts once per process.
 */
export function startSweep(deps: () => Deps, intervalMs = SWEEP_INTERVAL_MS): void {
  if (holder.__presentkortSweep) return;
  holder.__presentkortSweep = setInterval(() => {
    const d = deps();
    expireDue(d, d.clock.now()).catch((e: unknown) => console.error("expireDue failed in the sweep", e));
  }, intervalMs);
  holder.__presentkortSweep.unref?.();
}

export function stopSweep(): void {
  clearInterval(holder.__presentkortSweep);
  holder.__presentkortSweep = undefined;
}
