import type { VerificationRequest, VerificationResult } from "@/adapters/gift-card-verifier";
import type { Deps } from "./deps";
import { DomainError } from "./errors";
import { kronor } from "./money";

/**
 * Runs the butikskontroll bounded by the configured timeout: a call unanswered in time counts
 * as inget svar. A late answer is ignored.
 */
export async function checkGiftCard(
  deps: Pick<Deps, "verifier" | "config">,
  request: VerificationRequest,
): Promise<VerificationResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<VerificationResult>((resolve) => {
    timer = setTimeout(() => resolve({ outcome: "no_response" }), deps.config.verifierTimeoutMs);
  });
  try {
    return await Promise.race([deps.verifier.verify(request), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const NOT_COMPLETED = "Butikskontrollen (simulerat) kunde inte genomföras. Försök igen om en stund.";

/**
 * The säljare's refusal for a butikskontroll at publicering phase that did not answer giltig
 * with the declared saldo, or undefined when it did. Every message is marked as simulated.
 */
export function publishCheckRefusal(result: VerificationResult, declaredBalance: number): DomainError | undefined {
  switch (result.outcome) {
    case "valid":
      if (result.balance === declaredBalance) return undefined;
      return new DomainError(
        "verification_failed",
        `Butikskontrollen (simulerat) anger saldot ${kronor(result.balance)}, inte ${kronor(declaredBalance)}. Rätta saldot och försök igen.`,
        "balance",
      );
    case "invalid":
      return new DomainError(
        "verification_failed",
        "Butikskontrollen (simulerat) godkände inte presentkortskoden.",
        "giftCardCode",
      );
    case "no_response":
    case "error":
      return new DomainError("verification_failed", NOT_COMPLETED);
  }
}
