import { describe, expect, it, vi } from "vitest";
import { listings, purchases, statusHistory } from "@/db/schema";
import { startPurchase } from "@/domain/purchases";
import { makeTestDeps, userId } from "../helpers";

const state = vi.hoisted(() => ({ deps: undefined as unknown }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/server/deps", () => ({ getDeps: () => state.deps, getCurrentDeps: async () => state.deps }));

describe("server actions", () => {
  it("data-changing actions refuse a missing session", async () => {
    const deps = makeTestDeps();
    state.deps = deps;
    const listingId = deps.db.select().from(listings).limit(1).get()!.id;
    // A köp exists, so the payment approve has something it could wrongly act on.
    const purchaseId = startPurchase(deps, userId(deps.db, "Kalle"), listingId);
    const snapshot = () => ({
      listings: deps.db.select().from(listings).all(),
      purchases: deps.db.select().from(purchases).all(),
      history: deps.db.select().from(statusHistory).all(),
    });
    const before = snapshot();

    const listingActions = await import("@/server/actions/listings");
    const purchaseActions = await import("@/server/actions/purchases");
    const authActions = await import("@/server/actions/auth");

    const form = new FormData();
    form.set("merchantId", "NK");
    form.set("giftCardCode", "NK-NO-SESSION");
    form.set("balance", "1000");
    form.set("price", "850");
    form.set("validUntil", "2027-11-17");
    form.set("listingId", String(listingId));
    form.set("purchaseId", String(purchaseId));

    const protectedActions: Array<[string, () => Promise<unknown>]> = [
      ...Object.entries(listingActions).map(([name, fn]) => [name, () => fn(undefined, form)] as [string, () => Promise<unknown>]),
      ...Object.entries(purchaseActions).map(([name, fn]) => [name, () => fn(undefined, form)] as [string, () => Promise<unknown>]),
      ["logOutAction", () => authActions.logOutAction()],
    ];
    expect(protectedActions.map(([name]) => name).sort()).toEqual(
      ["approvePaymentAction", "declinePaymentAction", "logOutAction", "publishListingAction", "startPurchaseAction"].sort(),
    );
    for (const [name, call] of protectedActions) {
      await expect(call(), name).rejects.toThrow("REDIRECT /logga-in");
    }
    expect(snapshot()).toEqual(before);
  });
});
