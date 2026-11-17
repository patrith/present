"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { latestSimulatedSms } from "@/adapters/sms";
import { type AuthOutcome, logIn, logOut, requestLoginCode, signUp } from "@/domain/auth";
import { getDeps } from "../deps";
import { LOGIN_SMS_COOKIE, SESSION_COOKIE, requireUser, sessionToken } from "../session";
import { type ActionResult, refusal } from "./result";

const COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax", path: "/" } as const;

/** Where each outcome leads; a sent code also ties its simulated SMS to this browser. */
async function follow(outcome: AuthOutcome): Promise<never> {
  const mobil = encodeURIComponent(outcome.phone);
  switch (outcome.kind) {
    case "refer_to_sign_up":
      redirect(`/skapa-konto?mobil=${mobil}&hanvisning=inget-konto`);
    case "refer_to_log_in":
      redirect(`/logga-in?mobil=${mobil}&hanvisning=konto-finns`);
    case "code_sent": {
      const sms = latestSimulatedSms(getDeps().db, outcome.phone);
      if (sms) (await cookies()).set(LOGIN_SMS_COOKIE, String(sms.id), COOKIE_OPTIONS);
      redirect(`/logga-in/kod?mobil=${mobil}`);
    }
  }
}

/** Public: sends the simulated SMS (also for "Begär ny inloggningskod"), or refers to kontoskapande. */
export async function requestLoginCodeAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  let outcome: AuthOutcome;
  try {
    outcome = await requestLoginCode(getDeps(), String(form.get("phone") ?? ""));
  } catch (e) {
    return refusal(e);
  }
  return follow(outcome);
}

/** Public: kontoskapande, then on to the inloggningskod; an existing number is referred to inloggning. */
export async function signUpAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  let outcome: AuthOutcome;
  try {
    outcome = await signUp(getDeps(), {
      phone: String(form.get("phone") ?? ""),
      firstName: String(form.get("firstName") ?? ""),
      lastName: String(form.get("lastName") ?? ""),
    });
  } catch (e) {
    return refusal(e);
  }
  return follow(outcome);
}

/** Public: checks the inloggningskod and opens the session. */
export async function logInAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  let token: string;
  try {
    token = logIn(getDeps(), String(form.get("phone") ?? ""), String(form.get("code") ?? ""));
  } catch (e) {
    return refusal(e);
  }
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, COOKIE_OPTIONS);
  jar.delete(LOGIN_SMS_COOKIE);
  redirect("/erbjudanden");
}

export async function logOutAction(): Promise<void> {
  await requireUser();
  const token = await sessionToken();
  if (token) logOut(getDeps().db, token);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/logga-in");
}
