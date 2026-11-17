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
  | "listing_unavailable"
  | "payment_declined"
  | "wrong_purchase_status";

/** An expected, user-facing refusal. `message` is Swedish UI text. */
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}
