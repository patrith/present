const DAY_MS = 86_400_000;
const TIME_ZONE = "Europe/Stockholm";

const dateFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const dateTimeFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** The calendar date (YYYY-MM-DD) of an instant in Swedish time. */
export function stockholmDate(instant: Date): string {
  return dateFormat.format(instant);
}

/** Date and time of an instant in Swedish time, e.g. "2026-11-17 12:00". */
export function formatStockholmDateTime(instant: Date): string {
  return dateTimeFormat.format(instant);
}

const wallClockFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

/** How far Swedish wall-clock time is ahead of UTC at an instant (1 h or 2 h). */
function stockholmOffsetMs(epochMs: number): number {
  const parts = Object.fromEntries(
    wallClockFormat.formatToParts(new Date(epochMs)).map((p) => [p.type, Number(p.value)]),
  );
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return wall - Math.floor(epochMs / 1000) * 1000;
}

/**
 * The instant a giltighetsdatum (YYYY-MM-DD) stops being valid: 00:00 Swedish time the following day.
 * Uses the Europe/Stockholm zone, so a day across a DST change ends correctly. The single such helper.
 */
export function endOfValidity(validUntil: string): Date {
  const [y, m, d] = validUntil.split("-").map(Number);
  const midnightAsUtc = Date.UTC(y, m - 1, d + 1);
  // Midnight is never inside a Swedish DST gap or overlap, so two passes settle the offset.
  let instant = midnightAsUtc - stockholmOffsetMs(midnightAsUtc);
  instant = midnightAsUtc - stockholmOffsetMs(instant);
  return new Date(instant);
}

/** Whether a giltighetsdatum has ended at `now`: true from 00:00 Swedish time the following day. */
export function isPastValidity(validUntil: string, now: Date): boolean {
  return endOfValidity(validUntil).getTime() <= now.getTime();
}

export function addDays(instant: Date, days: number): Date {
  return new Date(instant.getTime() + days * DAY_MS);
}
