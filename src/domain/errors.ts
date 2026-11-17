export type DomainErrorCode =
  | "transition_not_allowed"
  | "transition_conflict"
  | "forbidden"
  | "not_found"
  | "invalid_input"
  | "invalid_phone"
  | "invalid_login_code"
  | "expired_login_code"
  | "verification_failed"
  | "duplicate_code"
  | "listing_locked"
  | "listing_unavailable"
  | "payment_declined"
  | "wrong_purchase_status";

/**
 * An expected, user-facing refusal. `message` is Swedish UI text; `field` names the form
 * field it concerns, when there is one.
 */
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}
