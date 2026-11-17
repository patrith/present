/** The only time source (ADR-005). No other module reads system time. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Demoläge: system time plus an offset the demo panel can move forward. */
export class OffsetClock implements Clock {
  private offsetMs = 0;
  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }
  advance(ms: number): void {
    this.offsetMs += ms;
  }
}

/** Tests: a fixed instant that only moves when told to. */
export class FixedClock implements Clock {
  private current: number;
  constructor(start: Date | string = "2026-11-17T12:00:00+01:00") {
    this.current = new Date(start).getTime();
  }
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current += ms;
  }
}
