/** Butikskontroll: the merchant's answer about a presentkortskod, at publicering or at köp. */
export type VerificationPhase = "publish" | "purchase";

export type VerificationResult =
  | { outcome: "valid"; balance: number }
  | { outcome: "invalid" }
  | { outcome: "no_response" }
  | { outcome: "error" };

export interface GiftCardVerifier {
  verify(request: { code: string; declaredBalance: number; phase: VerificationPhase }): Promise<VerificationResult>;
}

/** The fixed kontrollerat saldo the `SALDO` prefix answers with. */
export const SALDO_FIXED_BALANCE = 800;

/**
 * The documented table (README, "Simulerad butikskontroll"), keyed on the code's prefix,
 * case-insensitive. Deterministic: the same input always gives the same answer.
 */
export const verifierTable: ReadonlyArray<{
  prefix: string;
  answer: (declaredBalance: number, phase: VerificationPhase) => VerificationResult;
}> = [
  { prefix: "OGILTIG", answer: () => ({ outcome: "invalid" }) },
  {
    prefix: "ANVAND",
    answer: (b, phase) => (phase === "publish" ? { outcome: "valid", balance: b } : { outcome: "invalid" }),
  },
  {
    prefix: "DELVIS",
    answer: (b, phase) => ({ outcome: "valid", balance: phase === "publish" ? b : b - 200 }),
  },
  { prefix: "SALDO", answer: () => ({ outcome: "valid", balance: SALDO_FIXED_BALANCE }) },
  { prefix: "TIMEOUT", answer: () => ({ outcome: "no_response" }) },
  { prefix: "FEL", answer: () => ({ outcome: "error" }) },
];

export class SimulatedGiftCardVerifier implements GiftCardVerifier {
  async verify({
    code,
    declaredBalance,
    phase,
  }: {
    code: string;
    declaredBalance: number;
    phase: VerificationPhase;
  }): Promise<VerificationResult> {
    const upper = code.trim().toUpperCase();
    const row = verifierTable.find((r) => upper.startsWith(r.prefix));
    return row ? row.answer(declaredBalance, phase) : { outcome: "valid", balance: declaredBalance };
  }
}
