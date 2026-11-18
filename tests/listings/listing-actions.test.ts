import { describe, expect, it, vi } from "vitest";
import { expireDue } from "@/domain/expire-due";
import { forceListingStatus, listingRow, makeTestDeps, publishNk, userId, type TestDeps } from "../helpers";

const state = vi.hoisted(() => ({ deps: undefined as unknown, userId: 0 }));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("@/server/session", () => ({ requireUser: async () => ({ id: state.userId }) }));
// getCurrentDeps runs the time rules first, as in the app; getDeps does not (ADR-005 call path 1).
vi.mock("@/server/deps", () => ({
  getDeps: () => state.deps,
  getCurrentDeps: async () => {
    const deps = state.deps as TestDeps;
    await expireDue(deps, deps.clock.now());
    return deps;
  },
}));

describe("listing actions", () => {
  it("apply due time rules before changing an annons", async () => {
    const deps = makeTestDeps();
    state.deps = deps;
    state.userId = userId(deps.db, "Sara");

    // A Flaggad annons whose giltighetsdatum has passed, before any sweep has expired it.
    const id = await publishNk(deps, "NK-8801");
    forceListingStatus(deps.db, id, "flagged", { flagReason: "saldoavvikelse", validUntil: "2020-01-01" });

    const { editListingAction, withdrawListingAction } = await import("@/server/actions/listings");
    const form = new FormData();
    form.set("listingId", String(id));
    form.set("price", "700");
    form.set("balance", "800");

    await expect(editListingAction(undefined, form)).resolves.toMatchObject({
      error: expect.stringContaining("status Utgången"),
    });
    await expect(withdrawListingAction(undefined, form)).resolves.toMatchObject({
      error: expect.stringContaining("status Utgången"),
    });
    expect(listingRow(deps.db, id)).toMatchObject({ status: "expired" });
  });
});
