import { isDomainError } from "@/domain/errors";

/** What a form action hands back to its form: a Swedish message, or nothing on success. */
export type ActionResult = { error: string } | undefined;

/** Turns an expected domain refusal into a form message; anything else is a real error. */
export function refusal(e: unknown): ActionResult {
  if (isDomainError(e)) return { error: e.message };
  throw e;
}
