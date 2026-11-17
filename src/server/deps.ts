import { SimulatedGiftCardVerifier } from "@/adapters/gift-card-verifier";
import { SimulatedPaymentProvider } from "@/adapters/payment-provider";
import { SimulatedSmsSender } from "@/adapters/sms";
import { openDb } from "@/db/client";
import { OffsetClock, systemClock } from "@/domain/clock";
import { loadConfig } from "@/domain/config";
import type { Deps } from "@/domain/deps";
import { databasePath } from "./database-path";

// Kept on globalThis so dev hot reload neither opens a second database nor resets the demo clock.
const holder = globalThis as typeof globalThis & { __presentkortDeps?: Deps };

/** The app's dependencies: the demo database, the (demo) clock and the simulated adapters. */
export function getDeps(): Deps {
  if (!holder.__presentkortDeps) {
    const config = loadConfig();
    const clock = config.demoMode ? new OffsetClock() : systemClock;
    const db = openDb(databasePath());
    holder.__presentkortDeps = {
      db,
      clock,
      config,
      sms: new SimulatedSmsSender(db, clock),
      verifier: new SimulatedGiftCardVerifier(),
      payments: new SimulatedPaymentProvider(),
    };
  }
  return holder.__presentkortDeps;
}
