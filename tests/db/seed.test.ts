import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { closeDb, type Db } from "@/db/client";
import { listings, merchants, statusHistory, users } from "@/db/schema";
import { resetDemoDatabase } from "@/db/seed";
import { FixedClock } from "@/domain/clock";
import { publishNk } from "../helpers";
import { SimulatedGiftCardVerifier } from "@/adapters/gift-card-verifier";
import { SimulatedPaymentProvider } from "@/adapters/payment-provider";
import { SimulatedSmsSender } from "@/adapters/sms";
import { loadConfig } from "@/domain/config";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "presentkort-seed-"));
const file = path.join(dir, "demo.db");
const open: Db[] = [];

afterEach(() => {
  while (open.length) closeDb(open.pop()!);
});

describe("demo start", () => {
  it("reset and seed leaves only merchants, demo admin and test users", async () => {
    const clock = new FixedClock();
    const earlier = resetDemoDatabase(file, clock);
    const deps = {
      db: earlier,
      clock,
      config: loadConfig({}),
      sms: new SimulatedSmsSender(earlier, clock),
      verifier: new SimulatedGiftCardVerifier(),
      payments: new SimulatedPaymentProvider(),
    };
    await publishNk(deps, "NK-EARLIER-RUN");
    closeDb(earlier);

    const db = resetDemoDatabase(file, clock);
    open.push(db);

    expect(db.select().from(listings).where(eq(listings.giftCardCode, "NK-EARLIER-RUN")).all()).toEqual([]);
    expect(db.select({ name: merchants.name }).from(merchants).all().map((m) => m.name).sort()).toEqual(
      ["Clas Ohlson", "Filmstaden", "ICA", "Nordiska Kompagniet", "Åhléns"].sort(),
    );
    const people = db.select().from(users).all();
    expect(people.map((u) => `${u.firstName}:${u.role}`).sort()).toEqual(
      ["Demo:admin", "Kalle:user", "Lisa:user", "Sara:user"].sort(),
    );
    const sara = people.find((u) => u.firstName === "Sara")!;

    const seeded = db.select().from(listings).all();
    expect(seeded.map((l) => l.merchantId).sort()).toEqual(["AH", "CO", "FS", "ICA"]);
    for (const l of seeded) {
      expect(l.sellerId).toBe(sara.id);
      expect(l.status).toBe("active");
      expect(l.giftCardCode.startsWith("SEED")).toBe(true);
      const history = db
        .select()
        .from(statusHistory)
        .where(and(eq(statusHistory.entityType, "listing"), eq(statusHistory.entityId, l.id)))
        .all();
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({ fromStatus: null, toStatus: "active", actorUserId: sara.id });
      expect(history[0].reason).not.toBe("");
    }
  });
});
