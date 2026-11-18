import type { GiftCardVerifier } from "@/adapters/gift-card-verifier";
import type { PaymentProvider } from "@/adapters/payment-provider";
import type { SmsSender } from "@/adapters/sms";
import type { Db } from "@/db/client";
import type { Clock } from "./clock";
import type { Config } from "./config";

/** Everything domain functions depend on, passed in by the caller (real or simulated). */
export interface Deps {
  db: Db;
  clock: Clock;
  config: Config;
  sms: SmsSender;
  verifier: GiftCardVerifier;
  payments: PaymentProvider;
}
