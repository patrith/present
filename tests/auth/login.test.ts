import { describe, expect, it } from "vitest";
import { latestSimulatedSms } from "@/adapters/sms";
import { sessions } from "@/db/schema";
import { logIn, requestLoginCode, userForSession } from "@/domain/auth";
import { type TestDeps, makeTestDeps } from "../helpers";

const KALLE = "0707654321";
const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** Requests an inloggningskod and reads it from the simulated SMS outbox, as the UI does. */
async function requestCode(deps: TestDeps, phone = KALLE): Promise<string> {
  await requestLoginCode(deps, phone);
  return latestSimulatedSms(deps.db, phone)!.body.match(/\b(\d{6})\b/)![1]!;
}

const otherThan = (code: string) => (code === "000000" ? "111111" : "000000");
const sessionCount = (deps: TestDeps) => deps.db.select().from(sessions).all().length;

describe("login with simulated SMS", () => {
  it("correct simulated sms code creates a session", async () => {
    const deps = makeTestDeps();
    const result = await requestLoginCode(deps, "070-123 45 67");
    expect(result).toEqual({ kind: "code_sent", phone: "0701234567" });

    const sms = latestSimulatedSms(deps.db, "0701234567");
    const code = sms?.body.match(/\b(\d{6})\b/)?.[1];
    expect(code).toMatch(/^\d{6}$/);
    // The code reaches the UI only through the simulated SMS outbox, never in the action's answer.
    expect(JSON.stringify(result)).not.toContain(code!);

    const token = logIn(deps, "0701234567", code!);
    expect(userForSession(deps.db, token)).toMatchObject({ firstName: "Sara", lastName: "Lind", role: "user" });
    expect(userForSession(deps.db, undefined)).toBeUndefined();
    expect(userForSession(deps.db, "not-a-token")).toBeUndefined();
  });

  it("wrong code is refused and offers new code", async () => {
    const deps = makeTestDeps();
    const code = await requestCode(deps);
    expect(() => logIn(deps, KALLE, otherThan(code))).toThrow(
      expect.objectContaining({ code: "invalid_login_code", message: expect.stringMatching(/ny inloggningskod/) }),
    );
    expect(sessionCount(deps)).toBe(0);
    // A wrong attempt leaves the open code usable within its validity.
    const token = logIn(deps, KALLE, code);
    expect(userForSession(deps.db, token)).toMatchObject({ firstName: "Kalle" });
    expect(sessionCount(deps)).toBe(1);
  });

  it("code valid at exactly 10 minutes and refused one second later", async () => {
    const late = makeTestDeps();
    const lateCode = await requestCode(late);
    late.clock.advance(10 * MINUTE + SECOND);
    expect(() => logIn(late, KALLE, lateCode)).toThrow(
      expect.objectContaining({
        code: "expired_login_code",
        message: expect.stringMatching(/gått ut.*ny inloggningskod/),
      }),
    );
    expect(sessionCount(late)).toBe(0);

    const onTime = makeTestDeps();
    const onTimeCode = await requestCode(onTime);
    onTime.clock.advance(10 * MINUTE);
    logIn(onTime, KALLE, onTimeCode);
    expect(sessionCount(onTime)).toBe(1);
  });

  it("used code cannot log in again", async () => {
    const deps = makeTestDeps();
    const code = await requestCode(deps);
    logIn(deps, KALLE, code);
    expect(sessionCount(deps)).toBe(1);
    // Another browser submitting the same code is the same domain call: it carries no browser state.
    expect(() => logIn(deps, KALLE, code)).toThrow(expect.objectContaining({ code: "invalid_login_code" }));
    expect(() => logIn(deps, "070-765 43 21", code)).toThrow(expect.objectContaining({ code: "invalid_login_code" }));
    expect(sessionCount(deps)).toBe(1);
  });

  it("new code replaces the old one", async () => {
    // A expired, then B requested: B's validity counts from its own issue time.
    const deps = makeTestDeps();
    const a = await requestCode(deps);
    deps.clock.advance(11 * MINUTE);
    expect(() => logIn(deps, KALLE, a)).toThrow(expect.objectContaining({ code: "expired_login_code" }));
    let b = await requestCode(deps);
    while (b === a) b = await requestCode(deps);
    deps.clock.advance(10 * MINUTE);
    expect(() => logIn(deps, KALLE, a)).toThrow(expect.objectContaining({ code: "invalid_login_code" }));
    logIn(deps, KALLE, b);
    expect(sessionCount(deps)).toBe(1);
    expect(() => logIn(deps, KALLE, a)).toThrow(expect.objectContaining({ code: "invalid_login_code" }));

    // A wrong code entered, then B requested while A is still within its validity: A no longer logs in.
    const other = makeTestDeps();
    const a2 = await requestCode(other);
    expect(() => logIn(other, KALLE, otherThan(a2))).toThrow(expect.objectContaining({ code: "invalid_login_code" }));
    let b2 = await requestCode(other);
    while (b2 === a2) b2 = await requestCode(other);
    expect(() => logIn(other, KALLE, a2)).toThrow(expect.objectContaining({ code: "invalid_login_code" }));
    expect(sessionCount(other)).toBe(0);
    logIn(other, KALLE, b2);
    expect(sessionCount(other)).toBe(1);
  });

  it("unknown or invalid number never logs in", () => {
    const deps = makeTestDeps();
    expect(() => logIn(deps, "0739876543", "123456")).toThrow(expect.objectContaining({ code: "invalid_login_code" }));
    expect(() => logIn(deps, "abc", "123456")).toThrow(expect.objectContaining({ code: "invalid_login_code" }));
    expect(sessionCount(deps)).toBe(0);
  });
});
