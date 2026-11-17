export interface Config {
  /** Reservationstid. */
  reservationMs: number;
  /** Reklamationsperiod. */
  claimPeriodMs: number;
  /** How long an inloggningskod stays valid. */
  loginCodeValidityMs: number;
  /** Demoläge: on unless DEMO_MODE=false. */
  demoMode: boolean;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function positiveNumber(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number, got "${value}"`);
  return n;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return {
    reservationMs: positiveNumber(env.RESERVATION_MINUTES, 5, "RESERVATION_MINUTES") * MINUTE,
    claimPeriodMs: positiveNumber(env.CLAIM_PERIOD_HOURS, 24, "CLAIM_PERIOD_HOURS") * HOUR,
    loginCodeValidityMs: positiveNumber(env.LOGIN_CODE_MINUTES, 10, "LOGIN_CODE_MINUTES") * MINUTE,
    demoMode: env.DEMO_MODE !== "false",
  };
}
