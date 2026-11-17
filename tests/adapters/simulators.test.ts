import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { SALDO_FIXED_BALANCE, SimulatedGiftCardVerifier, verifierTable } from "@/adapters/gift-card-verifier";
import { SimulatedPaymentProvider } from "@/adapters/payment-provider";

describe("simulated adapters", () => {
  it("verifier returns the documented outcome for every row at both phases", async () => {
    const verifier = new SimulatedGiftCardVerifier();
    const declared = 1000;
    const expected: Record<string, { publish: object; purchase: object }> = {
      "OGILTIG-1": { publish: { outcome: "invalid" }, purchase: { outcome: "invalid" } },
      "ANVAND-1": { publish: { outcome: "valid", balance: declared }, purchase: { outcome: "invalid" } },
      "DELVIS-1": {
        publish: { outcome: "valid", balance: declared },
        purchase: { outcome: "valid", balance: declared - 200 },
      },
      "SALDO-1": {
        publish: { outcome: "valid", balance: SALDO_FIXED_BALANCE },
        purchase: { outcome: "valid", balance: SALDO_FIXED_BALANCE },
      },
      "TIMEOUT-1": { publish: { outcome: "no_response" }, purchase: { outcome: "no_response" } },
      "FEL-1": { publish: { outcome: "error" }, purchase: { outcome: "error" } },
      "NK-4471-9920": {
        publish: { outcome: "valid", balance: declared },
        purchase: { outcome: "valid", balance: declared },
      },
    };
    expect(SALDO_FIXED_BALANCE).toBe(800);
    for (const [code, phases] of Object.entries(expected)) {
      for (const phase of ["publish", "purchase"] as const) {
        for (let call = 0; call < 3; call++) {
          expect(await verifier.verify({ code, declaredBalance: declared, phase }), `${code} ${phase}`).toEqual(
            phases[phase],
          );
        }
      }
    }
    // Prefix match is case-insensitive.
    expect(await verifier.verify({ code: "ogiltig-x", declaredBalance: 1, phase: "publish" })).toEqual({
      outcome: "invalid",
    });

    // README documents every prefix of the table.
    const readme = fs.readFileSync("README.md", "utf8");
    for (const row of verifierTable) expect(readme).toContain(`\`${row.prefix}\``);
  });

  it("authorize follows only the approve flag and capture is idempotent", async () => {
    const payments = new SimulatedPaymentProvider();
    for (const amount of [1, 850, 100_000]) {
      expect(await payments.authorize({ amount, approve: false })).toEqual({ outcome: "declined" });
      expect(await payments.authorize({ amount, approve: true })).toMatchObject({ outcome: "authorized" });
    }
    const auth = await payments.authorize({ amount: 850, approve: true });
    if (auth.outcome !== "authorized") throw new Error("expected authorization");
    await payments.capture(auth.authorizationId);
    await payments.capture(auth.authorizationId);
    expect(payments.captureCount(auth.authorizationId)).toBe(1);
  });
});
