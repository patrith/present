import { type DomainErrorCode, isDomainError } from "@/domain/errors";

/**
 * What a form action hands back to its form: a Swedish message, with the form field it concerns
 * when there is one and the label of the simulated step that refused it, or nothing on success.
 */
export type ActionResult = { error: string; field?: string; simulated?: string } | undefined;

/** A refusal by the butikskontroll is shown inside its simulated element (FR10). */
const SIMULATED_BY: Partial<Record<DomainErrorCode, string>> = { verification_failed: "Simulerad butikskontroll" };

/** Turns an expected domain refusal into a form message; anything else is a real error. */
export function refusal(e: unknown): ActionResult {
  if (!isDomainError(e)) throw e;
  const simulated = SIMULATED_BY[e.code];
  return { error: e.message, ...(e.field && { field: e.field }), ...(simulated && { simulated }) };
}

/** A whole-kronor form value; an empty or missing field is not a number. */
export function formNumber(form: FormData, name: string): number {
  const raw = String(form.get(name) ?? "").trim();
  return raw === "" ? Number.NaN : Number(raw);
}
