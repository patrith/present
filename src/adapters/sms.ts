import { desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { smsOutbox } from "@/db/schema";
import type { Clock } from "@/domain/clock";

export interface SmsSender {
  send(phone: string, body: string): Promise<void>;
}

/** Simulated SMS: messages land in an outbox the UI shows in a box labelled "Simulerat SMS". */
export class SimulatedSmsSender implements SmsSender {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  async send(phone: string, body: string): Promise<void> {
    this.db.insert(smsOutbox).values({ phone, body, sentAt: this.clock.now() }).run();
  }
}

/** The latest simulated SMS sent to a phone number, for the "Simulerat SMS" box. */
export function latestSimulatedSms(db: Db, phone: string): { body: string; sentAt: Date } | undefined {
  return db
    .select({ body: smsOutbox.body, sentAt: smsOutbox.sentAt })
    .from(smsOutbox)
    .where(eq(smsOutbox.phone, phone))
    .orderBy(desc(smsOutbox.id))
    .limit(1)
    .get();
}
