import { describe, expect, it } from "vitest";
import { loginCodes, smsOutbox } from "@/db/schema";
import { requestLoginCode } from "@/domain/auth";
import { makeTestDeps } from "../helpers";

describe("request inloggningskod", () => {
  it("unregistered number is referred to sign-up with number", async () => {
    const deps = makeTestDeps();
    const outcome = await requestLoginCode(deps, "073-987 65 43");
    expect(outcome).toEqual({ kind: "refer_to_sign_up", phone: "0739876543" });
    expect(deps.db.select().from(smsOutbox).all()).toEqual([]);
    expect(deps.db.select().from(loginCodes).all()).toEqual([]);
  });

  it("invalid number is refused", async () => {
    const deps = makeTestDeps();
    for (const input of ["0812345678", "07012345", "abc"]) {
      await expect(requestLoginCode(deps, input), input).rejects.toMatchObject({
        code: "invalid_phone",
        message: expect.stringContaining("070 123 45 67"),
      });
    }
    expect(deps.db.select().from(smsOutbox).all()).toEqual([]);
    expect(deps.db.select().from(loginCodes).all()).toEqual([]);
  });

  it("registered number in any accepted spelling gets a code", async () => {
    const deps = makeTestDeps();
    for (const spelling of ["070-123 45 67", "070 123 45 67", "+46 70 123 45 67"]) {
      expect(await requestLoginCode(deps, spelling)).toEqual({ kind: "code_sent", phone: "0701234567" });
    }
    const outbox = deps.db.select().from(smsOutbox).all();
    expect(outbox.map((s) => s.phone)).toEqual(["0701234567", "0701234567", "0701234567"]);
  });
});
