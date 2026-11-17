import { describe, expect, it } from "vitest";
import { latestSimulatedSms } from "@/adapters/sms";
import { logIn, requestLoginCode, userForSession } from "@/domain/auth";
import { makeTestDeps } from "../helpers";

describe("login with simulated SMS", () => {
  it("correct simulated sms code creates a session", async () => {
    const deps = makeTestDeps();
    const result = await requestLoginCode(deps, "070-123 45 67");
    expect(result).toEqual({ phone: "0701234567" });

    const sms = latestSimulatedSms(deps.db, "0701234567");
    const code = sms?.body.match(/\b(\d{6})\b/)?.[1];
    expect(code).toMatch(/^\d{6}$/);
    // The code reaches the UI only through the simulated SMS outbox, never in the action's answer.
    expect(JSON.stringify(result)).not.toContain(code!);

    expect(() => logIn(deps, "0701234567", code === "000000" ? "111111" : "000000")).toThrow(
      expect.objectContaining({ code: "invalid_login_code" }),
    );
    const token = logIn(deps, "0701234567", code!);
    expect(userForSession(deps.db, token)).toMatchObject({ firstName: "Sara", lastName: "Lind", role: "user" });
    // A used code cannot open a second session.
    expect(() => logIn(deps, "0701234567", code!)).toThrow(expect.objectContaining({ code: "invalid_login_code" }));
    expect(userForSession(deps.db, undefined)).toBeUndefined();
    expect(userForSession(deps.db, "not-a-token")).toBeUndefined();
  });
});
