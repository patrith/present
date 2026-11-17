import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type SessionUser, userForSession } from "@/domain/auth";
import { getDeps } from "./deps";

export const SESSION_COOKIE = "session";

/** Id of the simulated SMS this browser last requested: the only one its "Simulerat SMS" box shows. */
export const LOGIN_SMS_COOKIE = "login_sms";

export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function currentUser(): Promise<SessionUser | undefined> {
  return userForSession(getDeps().db, await sessionToken());
}

/** Why inloggning was needed, shown there as a hint (`?hanvisning=`). */
export type LoginHint = "erbjudanden";

/** Pages and data-changing actions: a visitor without a session goes to inloggning, with an optional hint. */
export async function requireUser(options: { hint?: LoginHint } = {}): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect(options.hint ? `/logga-in?hanvisning=${options.hint}` : "/logga-in");
  return user;
}
