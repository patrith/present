import { count, eq } from "drizzle-orm";
import { statusHistory, users } from "@/db/schema";
import { approvePayment, startPurchase } from "@/domain/purchases";
import { makeTestDeps, publishNk, type TestDeps, userId } from "../helpers";

// Shared fixture for the after-leverans tests (story S06). Not a test file itself.

export const CLAIM_PERIOD_MS = 24 * 60 * 60_000;

/**
 * Kalle's köp of Sara's NK annons at belopp 850 kr, Levererat at the clock's 12:00 through the real
 * köp flow. Reuses `deps` when given, so a second köp can share one database.
 */
export async function deliveredPurchase(given?: TestDeps, code = "NK-4471-9920") {
  const deps = given ?? makeTestDeps();
  const [sara, kalle, lisa, admin] = (["Sara", "Kalle", "Lisa", "Demo"] as const).map((n) => userId(deps.db, n));
  const listingId = await publishNk(deps, code);
  const purchaseId = startPurchase(deps, kalle, listingId);
  const outcome = await approvePayment(deps, kalle, purchaseId);
  if (outcome.kind !== "delivered") throw new Error(`expected leverans, got ${outcome.kind}`);
  return { deps, sara, kalle, lisa, admin, listingId, purchaseId, code };
}

export function payoutOf(deps: TestDeps, id: number): number {
  return deps.db.select({ b: users.payoutBalance }).from(users).where(eq(users.id, id)).get()!.b;
}

export function historyCount(deps: TestDeps): number {
  return deps.db.select({ n: count() }).from(statusHistory).get()!.n;
}
