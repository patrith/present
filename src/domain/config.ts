export interface Config {
  /** Reservationstid. */
  reservationMs: number;
  /** Reklamationsperiod. */
  claimPeriodMs: number;
  /** How long an inloggningskod stays valid. */
  loginCodeValidityMs: number;
  /** How long the butikskontroll at köp may take before it counts as no answer. */
  verifierTimeoutMs: number;
  /** Demoläge: on unless DEMO_MODE=false. */
  demoMode: boolean;
}

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
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
    verifierTimeoutMs: positiveNumber(env.VERIFIER_TIMEOUT_SECONDS, 5, "VERIFIER_TIMEOUT_SECONDS") * SECOND,
    demoMode: env.DEMO_MODE !== "false",
  };
}
