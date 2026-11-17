import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type SessionUser, userForSession } from "@/domain/auth";
import { getDeps } from "./deps";

export const SESSION_COOKIE = "session";

export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function currentUser(): Promise<SessionUser | undefined> {
  return userForSession(getDeps().db, await sessionToken());
}

/** Pages and data-changing actions: a visitor without a session goes to inloggning. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/logga-in");
  return user;
}
