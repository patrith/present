import fs from "node:fs";
import path from "node:path";
import type { Clock } from "@/domain/clock";
import { addDays, stockholmDate } from "@/domain/dates";
import { PUBLISH_REASON } from "@/domain/listings";
import { transition } from "@/domain/transition";
import { type Db, openDb } from "./client";
import { merchants, users } from "./schema";

/** The fixed list of handlare (prototype's MERCHANTS). */
const seedMerchants = [
  { id: "NK", name: "Nordiska Kompagniet" },
  { id: "AH", name: "Åhléns" },
  { id: "FS", name: "Filmstaden" },
  { id: "CO", name: "Clas Ohlson" },
  { id: "ICA", name: "ICA" },
] as const;

/** Test users and the demoadministratör (prototype's S.users); README lists them. */
const seedUsers = [
  { phone: "0701234567", firstName: "Sara", lastName: "Lind", role: "user" },
  { phone: "0707654321", firstName: "Kalle", lastName: "Berg", role: "user" },
  { phone: "0731112233", firstName: "Lisa", lastName: "Ek", role: "user" },
  { phone: "0700000000", firstName: "Demo", lastName: "Admin", role: "admin" },
] as const;

/** Sara's four Aktiv annonser at demo start; none at NK, so the demo flow's NK annons stands alone. */
const seedListings = [
  { merchantId: "AH", giftCardCode: "SEED-AH-2210-5531", balance: 500, price: 400, validInDays: 4 },
  { merchantId: "FS", giftCardCode: "SEED-FS-7781-0042", balance: 300, price: 240, validInDays: 90 },
  { merchantId: "CO", giftCardCode: "SEED-CO-1182-6630", balance: 250, price: 200, validInDays: 60 },
  { merchantId: "ICA", giftCardCode: "SEED-ICA-3301-7714", balance: 1000, price: 880, validInDays: 135 },
] as const;

export function seed(db: Db, clock: Clock): void {
  const now = clock.now();
  db.transaction((tx) => {
    tx.insert(merchants).values([...seedMerchants]).run();
    const inserted = tx
      .insert(users)
      .values(seedUsers.map((u) => ({ ...u })))
      .returning({ id: users.id, firstName: users.firstName })
      .all();
    const sara = inserted.find((u) => u.firstName === "Sara")!;
    for (const l of seedListings) {
      transition(tx, {
        entity: "listing",
        from: null,
        to: "active",
        actorUserId: sara.id,
        reason: PUBLISH_REASON,
        at: now,
        values: {
          sellerId: sara.id,
          merchantId: l.merchantId,
          giftCardCode: l.giftCardCode,
          balance: l.balance,
          price: l.price,
          validUntil: stockholmDate(addDays(now, l.validInDays)),
          createdAt: now,
        },
      });
    }
  });
}

/** Demo start: deletes the database file, recreates the schema and seeds it. */
export function resetDemoDatabase(file: string, clock: Clock): Db {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(file + suffix, { force: true });
  const db = openDb(file);
  seed(db, clock);
  return db;
}
