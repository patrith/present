import { randomBytes, randomInt } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { loginCodes, sessions, users } from "@/db/schema";
import type { Deps } from "./deps";
import { DomainError } from "./errors";

export type SessionUser = { id: number; firstName: string; lastName: string; role: "user" | "admin" };

/** Where a request for an inloggningskod or a kontoskapande led: code sent, or a hänvisning elsewhere. */
export type AuthOutcome =
  | { kind: "code_sent"; phone: string }
  | { kind: "refer_to_sign_up"; phone: string }
  | { kind: "refer_to_log_in"; phone: string };

const INVALID_PHONE = "Ange ett svenskt mobilnummer, t.ex. 070 123 45 67.";
const NEW_CODE_HINT = "Begär en ny inloggningskod.";

/**
 * The only path from typed mobilnummer to storage or lookup: `07` + 8 digits, also written
 * `+46 7…` or `0046 7…`, spaces and dashes ignored. Returns the normalized `07XXXXXXXX`.
 */
export function normalizeMobileNumber(input: string): string {
  const compact = input.replace(/[\s-]/g, "");
  const match = /^(?:0|\+46|0046)(7\d{8})$/.exec(compact);
  if (!match) throw new DomainError("invalid_phone", INVALID_PHONE);
  return "0" + match[1];
}

function userByPhone(db: Db, phone: string): { id: number } | undefined {
  return db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).get();
}

/** Issues a fresh six-digit inloggningskod. Being the number's latest code, it replaces any earlier one. */
async function sendLoginCode(deps: Deps, userId: number, phone: string): Promise<void> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  deps.db.insert(loginCodes).values({ userId, code, createdAt: deps.clock.now() }).run();
  await deps.sms.send(phone, `Din inloggningskod är ${code}`);
}

/** Inloggning: sends an inloggningskod to a registered mobilnummer, else refers to kontoskapande. */
export async function requestLoginCode(deps: Deps, phoneInput: string): Promise<AuthOutcome> {
  const phone = normalizeMobileNumber(phoneInput);
  const user = userByPhone(deps.db, phone);
  if (!user) return { kind: "refer_to_sign_up", phone };
  await sendLoginCode(deps, user.id, phone);
  return { kind: "code_sent", phone };
}

/** Kontoskapande: creates an användare and sends an inloggningskod, or refers an existing number to inloggning. */
export async function signUp(
  deps: Deps,
  input: { phone: string; firstName: string; lastName: string },
): Promise<AuthOutcome> {
  const phone = normalizeMobileNumber(input.phone);
  if (userByPhone(deps.db, phone)) return { kind: "refer_to_log_in", phone };
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) throw new DomainError("invalid_input", "Fyll i förnamn och efternamn.");
  const user = deps.db
    .insert(users)
    .values({ phone, firstName, lastName, role: "user" })
    .returning({ id: users.id })
    .get();
  await sendLoginCode(deps, user.id, phone);
  return { kind: "code_sent", phone };
}

/**
 * Logs in only with the number's latest inloggningskod, unused and at most the configured
 * validity old by the Clock. Marking it used and opening the session happen in one transaction,
 * guarded so two submissions of one code never open two sessions. Returns the session token.
 */
export function logIn(deps: Pick<Deps, "db" | "clock" | "config">, phoneInput: string, codeInput: string): string {
  const wrong = new DomainError("invalid_login_code", `Inloggningskoden stämmer inte. ${NEW_CODE_HINT}`);
  let phone: string;
  try {
    phone = normalizeMobileNumber(phoneInput);
  } catch {
    throw wrong;
  }
  const now = deps.clock.now();
  const user = userByPhone(deps.db, phone);
  if (!user) throw wrong;
  const latest = deps.db
    .select()
    .from(loginCodes)
    .where(eq(loginCodes.userId, user.id))
    .orderBy(desc(loginCodes.id))
    .limit(1)
    .get();
  if (!latest) throw wrong;
  if (now.getTime() - latest.createdAt.getTime() > deps.config.loginCodeValidityMs) {
    throw new DomainError("expired_login_code", `Inloggningskoden har gått ut. ${NEW_CODE_HINT}`);
  }
  if (latest.usedAt || latest.code !== codeInput.trim()) throw wrong;

  const token = randomBytes(32).toString("base64url");
  deps.db.transaction((tx) => {
    const marked = tx
      .update(loginCodes)
      .set({ usedAt: now })
      .where(and(eq(loginCodes.id, latest.id), isNull(loginCodes.usedAt)))
      .run();
    if (marked.changes !== 1) throw wrong;
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
