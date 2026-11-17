import { randomBytes, randomInt } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { loginCodes, sessions, users } from "@/db/schema";
import type { Deps } from "./deps";
import { DomainError } from "./errors";

export type SessionUser = { id: number; firstName: string; lastName: string; role: "user" | "admin" };

/** Strips spaces and dashes and turns +46 into a leading 0. Full validation is story S02's. */
export function normalizePhone(input: string): string {
  const compact = input.replace(/[\s-]/g, "");
  return compact.startsWith("+46") ? "0" + compact.slice(3) : compact;
}

/** Sends a six-digit inloggningskod through the SmsSender to a registered mobilnummer. */
export async function requestLoginCode(deps: Deps, phoneInput: string): Promise<{ phone: string }> {
  const phone = normalizePhone(phoneInput);
  const user = deps.db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).get();
  if (!user) throw new DomainError("unknown_phone", "Det finns inget konto för mobilnumret.");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  deps.db.insert(loginCodes).values({ userId: user.id, code, createdAt: deps.clock.now() }).run();
  await deps.sms.send(phone, `Din inloggningskod är ${code}`);
  return { phone };
}

/** Checks the latest unused inloggningskod and opens a session. Returns the session token. */
export function logIn(deps: Pick<Deps, "db" | "clock" | "config">, phoneInput: string, codeInput: string): string {
  const phone = normalizePhone(phoneInput);
  const now = deps.clock.now();
  const refused = new DomainError("invalid_login_code", "Inloggningskoden stämmer inte.");
  const user = deps.db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).get();
  if (!user) throw refused;
  const latest = deps.db
    .select()
    .from(loginCodes)
    .where(
      and(
        eq(loginCodes.userId, user.id),
        isNull(loginCodes.usedAt),
        gt(loginCodes.createdAt, new Date(now.getTime() - deps.config.loginCodeValidityMs)),
      ),
    )
    .orderBy(desc(loginCodes.id))
    .limit(1)
    .get();
  if (!latest || latest.code !== codeInput.trim()) throw refused;

  const token = randomBytes(32).toString("base64url");
  deps.db.transaction((tx) => {
    tx.update(loginCodes).set({ usedAt: now }).where(eq(loginCodes.id, latest.id)).run();
    tx.insert(sessions).values({ token, userId: user.id, createdAt: now }).run();
  });
  return token;
}

export function userForSession(db: Db, token: string | undefined): SessionUser | undefined {
  if (!token) return undefined;
  return db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.token, token))
    .get();
}

export function logOut(db: Db, token: string): void {
  db.delete(sessions).where(eq(sessions.token, token)).run();
}
