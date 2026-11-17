import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { latestSimulatedSms } from "@/adapters/sms";
import { smsOutbox, users } from "@/db/schema";
import { logIn, requestLoginCode, signUp, userForSession } from "@/domain/auth";
import { type TestDeps, makeTestDeps } from "../helpers";

const userCount = (deps: TestDeps) => deps.db.select().from(users).all().length;
const outboxCount = (deps: TestDeps) => deps.db.select().from(smsOutbox).all().length;

describe("kontoskapande", () => {
  it("creates account and sends login code", async () => {
    const deps = makeTestDeps();
    const before = userCount(deps);
    const outcome = await signUp(deps, { phone: "073-987 65 43", firstName: "  Nora ", lastName: "Berg  " });
    expect(outcome).toEqual({ kind: "code_sent", phone: "0739876543" });
    expect(userCount(deps)).toBe(before + 1);
    const nora = deps.db.select().from(users).where(eq(users.phone, "0739876543")).get();
    expect(nora).toMatchObject({ firstName: "Nora", lastName: "Berg", role: "user" });
    expect(outboxCount(deps)).toBe(1);

    const code = latestSimulatedSms(deps.db, "0739876543")!.body.match(/\b(\d{6})\b/)![1]!;
    const token = logIn(deps, "0739876543", code);
    expect(userForSession(deps.db, token)).toMatchObject({ firstName: "Nora", lastName: "Berg", role: "user" });
  });

  it("refuses missing names", async () => {
    const deps = makeTestDeps();
    const before = userCount(deps);
    for (const names of [
      { firstName: "", lastName: "Berg" },
      { firstName: "Nora", lastName: "" },
      { firstName: "   ", lastName: "Berg" },
      { firstName: "Nora", lastName: "  " },
    ]) {
      await expect(signUp(deps, { phone: "0739876543", ...names })).rejects.toMatchObject({ code: "invalid_input" });
    }
    expect(userCount(deps)).toBe(before);
    expect(outboxCount(deps)).toBe(0);
  });

  it("refuses invalid numbers", async () => {
    const deps = makeTestDeps();
    const before = userCount(deps);
    for (const phone of ["0812345678", "07012345", "abc"]) {
      await expect(signUp(deps, { phone, firstName: "Nora", lastName: "Berg" }), phone).rejects.toMatchObject({
        code: "invalid_phone",
        message: expect.stringContaining("070 123 45 67"),
      });
    }
    expect(userCount(deps)).toBe(before);
    expect(outboxCount(deps)).toBe(0);
  });

  it("existing number is referred to login unchanged", async () => {
    const deps = makeTestDeps();
    const before = deps.db.select().from(users).all();
    const outcome = await signUp(deps, { phone: "0707654321", firstName: "Karl", lastName: "Ek" });
    expect(outcome).toEqual({ kind: "refer_to_log_in", phone: "0707654321" });
    expect(deps.db.select().from(users).all()).toEqual(before);
    expect(deps.db.select().from(users).where(eq(users.phone, "0707654321")).get()).toMatchObject({
      firstName: "Kalle",
      lastName: "Berg",
    });
    expect(outboxCount(deps)).toBe(0);
  });

  it("spelling variants map to one account", async () => {
    const deps = makeTestDeps();
    await signUp(deps, { phone: "+46 73 987 65 43", firstName: "Nora", lastName: "Berg" });
    expect(deps.db.select().from(users).where(eq(users.phone, "0739876543")).all()).toHaveLength(1);
    const before = userCount(deps);

    expect(await requestLoginCode(deps, "073-987 65 43")).toEqual({ kind: "code_sent", phone: "0739876543" });
    expect(await signUp(deps, { phone: "0046 739 876 543", firstName: "Nora", lastName: "Berg" })).toEqual({
      kind: "refer_to_log_in",
      phone: "0739876543",
    });
    expect(userCount(deps)).toBe(before);
    const phones = deps.db.select({ phone: users.phone }).from(users).all();
    expect(phones.every((u) => /^07\d{8}$/.test(u.phone))).toBe(true);
  });
});
