import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { listings, purchases, type ListingStatus } from "@/db/schema";
import { DomainError } from "@/domain/errors";
import { allowedTransitions, transition } from "@/domain/transition";
import { forceListingStatus, historyOf, makeTestDeps, userId } from "../helpers";

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
    const history = historyOf(deps, "listing", listing.id);
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
    expect(historyOf(deps, "listing", listing.id)).toHaveLength(2);

    // Unlisted pair: refused before touching the database.
    expect(() =>
      transition(deps.db, {
        entity: "listing",
        id: listing.id,
        from: "sold",
        to: "active",
        actorUserId: null,
        reason: "otillåten",
        at: deps.clock.now(),
      }),
    ).toThrow(expect.objectContaining({ code: "transition_not_allowed" }));
    expect(deps.db.select().from(listings).where(eq(listings.id, listing.id)).get()!.status).toBe("reserved");
    expect(historyOf(deps, "listing", listing.id)).toHaveLength(2);
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
    expect(historyOf(deps, "listing", listing.id)).toHaveLength(1);
  });

  it("purchase failure transitions are allowed and others still refused", () => {
    const deps = makeTestDeps();
    const kalle = userId(deps.db, "Kalle");
    const [first, second] = deps.db.select().from(listings).limit(2).all();
    const at = deps.clock.now();
    const reserve = (id: number) =>
      transition(deps.db, {
        entity: "listing",
        id,
        from: "active",
        to: "reserved",
        actorUserId: kalle,
        reason: "reserverad",
        at,
        set: { reservedById: kalle },
      });
    const newPurchase = (listingId: number) =>
      transition(deps.db, {
        entity: "purchase",
        from: null,
        to: "started",
        actorUserId: kalle,
        reason: "påbörjat",
        at,
        values: { listingId, buyerId: kalle, amount: 100, createdAt: at },
      });

    // Each of the four new pairs succeeds once, stores its orsak in its history row, and a repeat changes nothing.
    reserve(first.id);
    reserve(second.id);
    const started = newPurchase(first.id);
    const authorized = newPurchase(second.id);
    transition(deps.db, { entity: "purchase", id: authorized, from: "started", to: "authorized", actorUserId: null, reason: "auktoriserad", at });

    const cases = [
      { entity: "listing", id: first.id, from: "reserved", to: "active", reason: "betalningen nekades", set: { reservedById: null } },
      { entity: "listing", id: second.id, from: "reserved", to: "flagged", reason: "ogiltig kod", set: { flagReason: "ogiltig kod" } },
      { entity: "purchase", id: started, from: "started", to: "failed", reason: "betalningen nekades", set: { failureReason: "betalningen nekades" } },
      { entity: "purchase", id: authorized, from: "authorized", to: "failed", reason: "butiken godkände inte koden", set: { failureReason: "butiken godkände inte koden" } },
    ] as const;
    for (const c of cases) {
      const run = () => transition(deps.db, { ...c, actorUserId: null, at } as Parameters<typeof transition>[1]);
      run();
      const history = historyOf(deps, c.entity, c.id);
      expect(history.at(-1)).toMatchObject({ fromStatus: c.from, toStatus: c.to, reason: c.reason, actorUserId: null });
      expect(run).toThrow(expect.objectContaining({ code: "transition_conflict" }));
      expect(historyOf(deps, c.entity, c.id)).toHaveLength(history.length);
    }
    expect(deps.db.select().from(listings).where(eq(listings.id, second.id)).get()).toMatchObject({
      status: "flagged",
      flagReason: "ogiltig kod",
    });
    expect(deps.db.select().from(purchases).where(eq(purchases.id, started)).get()).toMatchObject({
      status: "failed",
      failureReason: "betalningen nekades",
    });

    // Unlisted pairs stay refused: a Misslyckat köp never revives, a Såld annons never returns to Aktiv.
    expect(() =>
      transition(deps.db, { entity: "purchase", id: started, from: "failed", to: "started", actorUserId: null, reason: "x", at }),
    ).toThrow(expect.objectContaining({ code: "transition_not_allowed" }));
    expect(() =>
      transition(deps.db, { entity: "listing", id: first.id, from: "sold", to: "active", actorUserId: null, reason: "x", at }),
    ).toThrow(expect.objectContaining({ code: "transition_not_allowed" }));
    expect(deps.db.select().from(purchases).where(eq(purchases.id, started)).get()!.status).toBe("failed");
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
      const historyBefore = historyOf(deps, "listing", listing.id).length;
      move(from, to);
      expect(deps.db.select().from(listings).where(eq(listings.id, listing.id)).get()!.status).toBe(to);
      const history = historyOf(deps, "listing", listing.id);
      expect(history).toHaveLength(historyBefore + 1);
      expect(history.at(-1)).toMatchObject({ fromStatus: from, toStatus: to, actorUserId: sara });
    }

    const refused: [ListingStatus, ListingStatus][] = [
      // reserved → active is story S05's FR5 row (a failed köp releases the annons), not an S03 addition.
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
      const historyBefore = historyOf(deps, "listing", listing.id).length;
      expect(() => move(from, to), `${from} → ${to}`).toThrow(
        expect.objectContaining({ code: "transition_not_allowed" }),
      );
      expect(deps.db.select().from(listings).where(eq(listings.id, listing.id)).get()!.status).toBe(from);
      expect(historyOf(deps, "listing", listing.id)).toHaveLength(historyBefore);
    }
  });

  // S06
  it("after-delivery transitions are allowed and others still refused", () => {
    type PurchaseStatus = (typeof purchases.$inferSelect)["status"];
    const deps = makeTestDeps();
    const kalle = userId(deps.db, "Kalle");
    const listing = firstSeededListing(deps);
    const at = deps.clock.now();
    const purchaseIn = (status: "delivered" | "disputed") => {
      const id = transition(deps.db, {
        entity: "purchase",
        from: null,
        to: "started",
        actorUserId: kalle,
        reason: "påbörjat",
        at,
        values: { listingId: listing.id, buyerId: kalle, amount: 100, createdAt: at },
      });
      deps.db.update(purchases).set({ status }).where(eq(purchases.id, id)).run();
      return id;
    };
    const move = (id: number, from: PurchaseStatus, to: PurchaseStatus) => () =>
      transition(deps.db, { entity: "purchase", id, from, to, actorUserId: null, reason: `${from} → ${to}`, at });

    const allowed: [PurchaseStatus, PurchaseStatus][] = [
      ["delivered", "completed"],
      ["delivered", "disputed"],
      ["disputed", "refunded"],
      ["disputed", "completed"],
    ];
    for (const [from, to] of allowed) {
      const id = purchaseIn(from as "delivered" | "disputed");
      const run = move(id, from, to);
      run();
      expect(deps.db.select().from(purchases).where(eq(purchases.id, id)).get()!.status).toBe(to);
      const history = historyOf(deps, "purchase", id);
      expect(history.at(-1)).toMatchObject({ fromStatus: from, toStatus: to });
      expect(run).toThrow(expect.objectContaining({ code: "transition_conflict" }));
      expect(historyOf(deps, "purchase", id)).toHaveLength(history.length);
    }

    const refused: [PurchaseStatus, PurchaseStatus][] = [
      ["refunded", "completed"],
      ["completed", "disputed"],
      ["completed", "refunded"],
      ["delivered", "refunded"],
      ["refunded", "disputed"],
    ];
    const id = purchaseIn("delivered");
    for (const [from, to] of refused) {
      expect(move(id, from, to), `${from} → ${to}`).toThrow(expect.objectContaining({ code: "transition_not_allowed" }));
    }
    expect(deps.db.select().from(purchases).where(eq(purchases.id, id)).get()!.status).toBe("delivered");
  });

  // S07
  it("listing expiry transitions are allowed and nothing else is added", () => {
    const deps = makeTestDeps();
    const listing = firstSeededListing(deps);
    const move = (from: ListingStatus, to: ListingStatus) =>
      transition(deps.db, {
        entity: "listing",
        id: listing.id,
        from,
        to,
        actorUserId: null,
        reason: "giltighetsdatumet 2026-11-17 har passerat",
        at: deps.clock.now(),
      });

    // SC01: exactly these three pairs lead to Utgången, and nothing leaves it.
    const intoExpired = allowedTransitions.listing.filter(([, to]) => to === "expired");
    expect(intoExpired).toEqual([
      ["active", "expired"],
      ["flagged", "expired"],
      ["reserved", "expired"],
    ]);
    expect(allowedTransitions.listing.filter(([from]) => from === "expired")).toEqual([]);

    for (const [from] of intoExpired) {
      forceListingStatus(deps.db, listing.id, from!);
      const historyBefore = historyOf(deps, "listing", listing.id).length;
      move(from!, "expired");
      expect(deps.db.select().from(listings).where(eq(listings.id, listing.id)).get()!.status).toBe("expired");
      const history = historyOf(deps, "listing", listing.id);
      expect(history).toHaveLength(historyBefore + 1);
      expect(history.at(-1)).toMatchObject({ fromStatus: from, toStatus: "expired", actorUserId: null });
      // A repeat changes nothing.
      expect(() => move(from!, "expired")).toThrow(expect.objectContaining({ code: "transition_conflict" }));
      expect(historyOf(deps, "listing", listing.id)).toHaveLength(historyBefore + 1);
    }

    const refused: [ListingStatus, ListingStatus][] = [
      ["expired", "active"],
      ["sold", "expired"],
      ["withdrawn", "expired"],
    ];
    for (const [from, to] of refused) {
      forceListingStatus(deps.db, listing.id, from);
      const historyBefore = historyOf(deps, "listing", listing.id).length;
      expect(() => move(from, to), `${from} → ${to}`).toThrow(
        expect.objectContaining({ code: "transition_not_allowed" }),
      );
      expect(deps.db.select().from(listings).where(eq(listings.id, listing.id)).get()!.status).toBe(from);
      expect(historyOf(deps, "listing", listing.id)).toHaveLength(historyBefore);
    }
  });
});
