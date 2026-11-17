import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { listings, statusHistory } from "@/db/schema";
import { publishListing, searchListings } from "@/domain/listings";
import { makeTestDeps, publishNk, userId } from "../helpers";

describe("publish listing", () => {
  it("valid card becomes active with history and appears in search", async () => {
    const deps = makeTestDeps();
    const sara = userId(deps.db, "Sara");
    const id = await publishNk(deps);

    expect(deps.db.select().from(listings).where(eq(listings.id, id)).get()).toMatchObject({
      sellerId: sara,
      merchantId: "NK",
      balance: 1000,
      price: 850,
      validUntil: "2027-11-17",
      status: "active",
    });
    const history = deps.db
      .select()
      .from(statusHistory)
      .where(and(eq(statusHistory.entityType, "listing"), eq(statusHistory.entityId, id)))
      .all();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ fromStatus: null, toStatus: "active", actorUserId: sara, at: deps.clock.now() });
    expect(history[0].reason).toMatch(/kontrollerad/);

    const found = searchListings(deps.db).find((l) => l.id === id);
    expect(found).toMatchObject({
      merchantName: "Nordiska Kompagniet",
      balance: 1000,
      price: 850,
      validUntil: "2027-11-17",
      status: "active",
    });

    // A code the butikskontroll answers ogiltig creates nothing.
    const before = deps.db.select().from(listings).all().length;
    await expect(
      publishListing(deps, sara, {
        merchantId: "NK",
        giftCardCode: "OGILTIG-123",
        balance: 1000,
        price: 850,
        validUntil: "2027-11-17",
      }),
    ).rejects.toMatchObject({ code: "verification_failed" });
    expect(deps.db.select().from(listings).all()).toHaveLength(before);
  });
});
