import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { listings, statusHistory, type ListingStatus } from "@/db/schema";
import { DomainError } from "@/domain/errors";
import { transition } from "@/domain/transition";
import { forceListingStatus, makeTestDeps, userId } from "../helpers";

function historyOf(deps: ReturnType<typeof makeTestDeps>, id: number) {
  return deps.db
    .select()
    .from(statusHistory)
    .where(and(eq(statusHistory.entityType, "listing"), eq(statusHistory.entityId, id)))
    .all();
}

function firstSeededListing(deps: ReturnType<typeof makeTestDeps>) {
  return deps.db.select().from(listings).limit(1).get()!;
}

describe("transition", () => {
  it("conditional update writes history once and refuses repeats and unlisted transitions", () => {
    const deps = makeTestDeps();
    const kalle = userId(deps.db, "Kalle");
    const listing = firstSeededListing(deps);
    const reserve = () =>
      transition(deps.db, {
        entity: "listing",
        id: listing.id,
        from: "active",
        to: "reserved",
        actorUserId: kalle,
        reason: "reserverad",
        at: deps.clock.now(),
        set: { reservedById: kalle },
      });

    // Success: one row changed, one history row with tidpunkt, aktör and orsak.
    reserve();
    expect(deps.db.select().from(listings).where(eq(listings.id, listing.id)).get()).toMatchObject({
      status: "reserved",
      reservedById: kalle,
    });
    const history = historyOf(deps, listing.id);
    expect(history).toHaveLength(2); // creation (seed) + reservation
    expect(history[1]).toMatchObject({
      fromStatus: "active",
      toStatus: "reserved",
      actorUserId: kalle,
      reason: "reserverad",
      at: deps.clock.now(),
    });

    // Repeat: changes nothing, domain error.
    expect(reserve).toThrow(DomainError);
    expect(() => reserve()).toThrow(expect.objectContaining({ code: "transition_conflict" }));
    expect(historyOf(deps, listing.id)).toHaveLength(2);

    // Unlisted pair: refused before touching the database.
    expect(() =>
      transition(deps.db, {
        entity: "listing",
        id: listing.id,
        from: "reserved",
        to: "active",
        actorUserId: null,
        reason: "otillåten",
        at: deps.clock.now(),
      }),
    ).toThrow(expect.objectContaining({ code: "transition_not_allowed" }));
    expect(deps.db.select().from(listings).where(eq(listings.id, listing.id)).get()!.status).toBe("reserved");
    expect(historyOf(deps, listing.id)).toHaveLength(2);
  });

  it("rolls back the status change when the history insert fails", () => {
    const deps = makeTestDeps();
    const listing = firstSeededListing(deps);
    deps.db.run(sql`drop table status_history`);
    expect(() =>
      transition(deps.db, {
        entity: "listing",
        id: listing.id,
        from: "active",
        to: "reserved",
        actorUserId: null,
        reason: "reserverad",
        at: deps.clock.now(),
      }),
    ).toThrow();
    expect(deps.db.select().from(listings).where(eq(listings.id, listing.id)).get()!.status).toBe("active");
  });

  it("joins the caller's transaction so paired writes roll back together", () => {
    const deps = makeTestDeps();
    const listing = firstSeededListing(deps);
    expect(() =>
      deps.db.transaction((tx) => {
        transition(tx, {
          entity: "listing",
          id: listing.id,
          from: "active",
          to: "reserved",
          actorUserId: null,
          reason: "reserverad",
          at: deps.clock.now(),
        });
        throw new Error("second write failed");
      }),
    ).toThrow("second write failed");
    expect(deps.db.select().from(listings).where(eq(listings.id, listing.id)).get()!.status).toBe("active");
    expect(historyOf(deps, listing.id)).toHaveLength(1);
  });

  it("listing management transitions are allowed and nothing else is added", () => {
    const deps = makeTestDeps();
    const sara = userId(deps.db, "Sara");
    const listing = firstSeededListing(deps);
    const move = (from: ListingStatus, to: ListingStatus) =>
      transition(deps.db, {
        entity: "listing",
        id: listing.id,
        from,
        to,
        actorUserId: sara,
        reason: `${from} → ${to}`,
        at: deps.clock.now(),
      });
    const allowed: [ListingStatus, ListingStatus][] = [
      ["active", "active"],
      ["active", "withdrawn"],
      ["flagged", "active"],
      ["flagged", "withdrawn"],
    ];
    for (const [from, to] of allowed) {
      forceListingStatus(deps.db, listing.id, from);
      const historyBefore = historyOf(deps, listing.id).length;
      move(from, to);
      expect(deps.db.select().from(listings).where(eq(listings.id, listing.id)).get()!.status).toBe(to);
      const history = historyOf(deps, listing.id);
      expect(history).toHaveLength(historyBefore + 1);
      expect(history.at(-1)).toMatchObject({ fromStatus: from, toStatus: to, actorUserId: sara });
    }

    const refused: [ListingStatus, ListingStatus][] = [
      ["reserved", "active"],
      ["reserved", "withdrawn"],
      ["sold", "withdrawn"],
      ["sold", "active"],
      ["expired", "withdrawn"],
      ["expired", "active"],
      ["withdrawn", "active"],
      ["withdrawn", "withdrawn"],
    ];
    for (const [from, to] of refused) {
      forceListingStatus(deps.db, listing.id, from);
      const historyBefore = historyOf(deps, listing.id).length;
      expect(() => move(from, to), `${from} → ${to}`).toThrow(
        expect.objectContaining({ code: "transition_not_allowed" }),
      );
      expect(deps.db.select().from(listings).where(eq(listings.id, listing.id)).get()!.status).toBe(from);
      expect(historyOf(deps, listing.id)).toHaveLength(historyBefore);
    }
  });
});
