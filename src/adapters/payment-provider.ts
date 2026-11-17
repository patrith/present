import { randomUUID } from "node:crypto";

export type AuthorizationResult = { outcome: "authorized"; authorizationId: string } | { outcome: "declined" };

/** Auktorisering, dragning, släpp and återbetalning at the (simulated) payment provider. */
export interface PaymentProvider {
  /** `approve` is the köpare's choice in the "Simulerad betalning" step. */
  authorize(request: { amount: number; approve: boolean }): Promise<AuthorizationResult>;
  /** Idempotent: a second capture of the same authorization draws nothing more. */
  capture(authorizationId: string): Promise<void>;
  void(authorizationId: string): Promise<void>;
  refund(authorizationId: string): Promise<void>;
}

type AuthorizationState = "authorized" | "captured" | "voided" | "refunded";

/** Simulated provider: the outcome follows only the köpare's approve/decline choice. */
export class SimulatedPaymentProvider implements PaymentProvider {
  private readonly authorizations = new Map<string, { amount: number; state: AuthorizationState; captures: number }>();

  async authorize({ amount, approve }: { amount: number; approve: boolean }): Promise<AuthorizationResult> {
    if (!approve) return { outcome: "declined" };
    const authorizationId = randomUUID();
    this.authorizations.set(authorizationId, { amount, state: "authorized", captures: 0 });
    return { outcome: "authorized", authorizationId };
  }

  async capture(authorizationId: string): Promise<void> {
    const a = this.get(authorizationId);
    if (a.state === "captured") return;
    if (a.state !== "authorized") throw new Error(`cannot capture an authorization that is ${a.state}`);
    a.state = "captured";
    a.captures += 1;
  }

  async void(authorizationId: string): Promise<void> {
    const a = this.get(authorizationId);
    if (a.state === "authorized") a.state = "voided";
  }

  async refund(authorizationId: string): Promise<void> {
    const a = this.get(authorizationId);
    if (a.state === "captured") a.state = "refunded";
  }

  /** How many times money was drawn for an authorization (tests). */
  captureCount(authorizationId: string): number {
    return this.authorizations.get(authorizationId)?.captures ?? 0;
  }

  private get(authorizationId: string) {
    const a = this.authorizations.get(authorizationId);
    if (!a) throw new Error("unknown authorization");
    return a;
  }
}
