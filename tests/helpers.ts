import { eq } from "drizzle-orm";
import { SimulatedGiftCardVerifier } from "@/adapters/gift-card-verifier";
import { SimulatedPaymentProvider } from "@/adapters/payment-provider";
import { SimulatedSmsSender } from "@/adapters/sms";
import { createTestDb, type Db } from "@/db/client";
import { users } from "@/db/schema";
import { seed } from "@/db/seed";
import { FixedClock } from "@/domain/clock";
import { loadConfig } from "@/domain/config";
import type { Deps } from "@/domain/deps";
import { publishListing } from "@/domain/listings";

export type TestDeps = Deps & { clock: FixedClock; payments: SimulatedPaymentProvider };

/** A fresh in-memory database seeded like demo start, with a fixed clock and simulators. */
export function makeTestDeps(): TestDeps {
  const db = createTestDb();
  const clock = new FixedClock();
  seed(db, clock);
  return {
    db,
    clock,
    config: loadConfig({}),
    sms: new SimulatedSmsSender(db, clock),
    verifier: new SimulatedGiftCardVerifier(),
    payments: new SimulatedPaymentProvider(),
  };
}

export function userId(db: Db, firstName: "Sara" | "Kalle" | "Lisa" | "Demo"): number {
  return db.select({ id: users.id }).from(users).where(eq(users.firstName, firstName)).get()!.id;
}

/** Sara's NK annons from the demo flow: saldo 1 000 kr, pris 850 kr, valid a year ahead. */
export function publishNk(deps: Deps, code = "NK-4471-9920"): Promise<number> {
  return publishListing(deps, userId(deps.db, "Sara"), {
    merchantId: "NK",
    giftCardCode: code,
    balance: 1000,
    price: 850,
    validUntil: "2027-11-17",
  });
}
