"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { logIn, logOut, requestLoginCode } from "@/domain/auth";
import { getDeps } from "../deps";
import { SESSION_COOKIE, requireUser, sessionToken } from "../session";
import { type ActionResult, refusal } from "./result";

/** Public: sends the simulated SMS and moves on to entering the inloggningskod. */
export async function requestLoginCodeAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  let phone: string;
  try {
    ({ phone } = await requestLoginCode(getDeps(), String(form.get("phone") ?? "")));
  } catch (e) {
    return refusal(e);
  }
  redirect(`/logga-in/kod?mobil=${encodeURIComponent(phone)}`);
}

/** Public: checks the inloggningskod and opens the session. */
export async function logInAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  let token: string;
  try {
    token = logIn(getDeps(), String(form.get("phone") ?? ""), String(form.get("code") ?? ""));
  } catch (e) {
    return refusal(e);
  }
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/erbjudanden");
}

export async function logOutAction(): Promise<void> {
  await requireUser();
  const token = await sessionToken();
  if (token) logOut(getDeps().db, token);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/logga-in");
}
