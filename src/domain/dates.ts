const DAY_MS = 86_400_000;
const TIME_ZONE = "Europe/Stockholm";

/** The calendar date (YYYY-MM-DD) of an instant in Swedish time. */
export function stockholmDate(instant: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    instant,
  );
}

/** Date and time of an instant in Swedish time, e.g. "2026-11-17 12:00". */
export function formatStockholmDateTime(instant: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(instant);
}

export function addDays(instant: Date, days: number): Date {
  return new Date(instant.getTime() + days * DAY_MS);
}
