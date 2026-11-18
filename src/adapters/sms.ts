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

export type SimulatedSms = { id: number; phone: string; body: string; sentAt: Date };

const columns = { id: smsOutbox.id, phone: smsOutbox.phone, body: smsOutbox.body, sentAt: smsOutbox.sentAt };

/** The latest simulated SMS sent to a phone number. */
export function latestSimulatedSms(db: Db, phone: string): SimulatedSms | undefined {
  return db.select(columns).from(smsOutbox).where(eq(smsOutbox.phone, phone)).orderBy(desc(smsOutbox.id)).limit(1).get();
}

/** One simulated SMS by id, for the "Simulerat SMS" box of the browser that requested it. */
export function simulatedSmsById(db: Db, id: number): SimulatedSms | undefined {
  return db.select(columns).from(smsOutbox).where(eq(smsOutbox.id, id)).get();
}
