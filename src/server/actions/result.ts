import { isDomainError } from "@/domain/errors";

/**
 * What a form action hands back to its form: a Swedish message, with the form field it concerns
 * when there is one, or nothing on success.
 */
export type ActionResult = { error: string; field?: string } | undefined;

/** Turns an expected domain refusal into a form message; anything else is a real error. */
export function refusal(e: unknown): ActionResult {
  if (isDomainError(e)) return e.field ? { error: e.message, field: e.field } : { error: e.message };
  throw e;
}

/** A whole-kronor form value; an empty or missing field is not a number. */
export function formNumber(form: FormData, name: string): number {
  const raw = String(form.get(name) ?? "").trim();
  return raw === "" ? Number.NaN : Number(raw);
}
