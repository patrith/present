import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { purchases } from "@/db/schema";
import { startPurchase } from "@/domain/purchases";
import { historyOf, listingRow, makeTestDeps, publishNk, userId } from "../helpers";

const ALREADY_RESERVED = "Annonsen är redan reserverad eller inte längre tillgänglig.";

describe("reserve", () => {
  it("concurrent, repeated and own-listing reservations", async () => {
    const deps = makeTestDeps();
    const kalle = userId(deps.db, "Kalle");
    const lisa = userId(deps.db, "Lisa");
    const sara = userId(deps.db, "Sara");

    // Two buyers at once, 20 rounds: exactly one Påbörjat köp and one refusal each round.
    for (let round = 0; round < 20; round++) {
      const listingId = await publishNk(deps, `NK-RACE-${round}`);
      const buyers = round % 2 === 0 ? [kalle, lisa] : [lisa, kalle];
      const results = await Promise.allSettled(buyers.map(async (b) => startPurchase(deps, b, listingId)));

      const won = results.filter((r) => r.status === "fulfilled");
      const lost = results.filter((r) => r.status === "rejected");
      expect(won).toHaveLength(1);
      expect(lost).toHaveLength(1);
      expect((lost[0] as PromiseRejectedResult).reason).toMatchObject({
        code: "listing_unavailable",
        message: ALREADY_RESERVED,
      });
      const created = deps.db.select().from(purchases).where(eq(purchases.listingId, listingId)).all();
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({ status: "started", id: (won[0] as PromiseFulfilledResult<number>).value });
      expect(listingRow(deps.db, listingId)).toMatchObject({ status: "reserved", reservedById: created[0].buyerId });
    }

    // The same buyer again (second tab): the same köp, no second köp or reservation.
    const listingId = await publishNk(deps, "NK-TWO-TABS");
    const first = startPurchase(deps, kalle, listingId);
    const historyBefore = historyOf(deps, "listing", listingId).length;
    expect(startPurchase(deps, kalle, listingId)).toBe(first);
    expect(
      deps.db
        .select()
        .from(purchases)
        .where(and(eq(purchases.listingId, listingId), eq(purchases.buyerId, kalle)))
        .all(),
    ).toHaveLength(1);
    expect(historyOf(deps, "listing", listingId)).toHaveLength(historyBefore);

    // The säljare: refused, no köp, the annons stays Aktiv.
    const own = await publishNk(deps, "NK-OWN");
    expect(() => startPurchase(deps, sara, own)).toThrow(
      expect.objectContaining({ code: "forbidden", message: "Du kan inte köpa din egen annons." }),
    );
    expect(deps.db.select().from(purchases).where(eq(purchases.listingId, own)).all()).toHaveLength(0);
    expect(listingRow(deps.db, own).status).toBe("active");
    expect(historyOf(deps, "listing", own)).toHaveLength(1);
  });
});
