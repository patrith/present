import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { completePurchaseTx } from "@/domain/completion";
import { confirmPurchase, getPurchaseForBuyer } from "@/domain/purchases";
import { historyOf, listingRow, purchaseRow } from "../helpers";
import { deliveredPurchase, payoutOf } from "./delivered";

describe("avslut", () => {
  it("completion credits once and rolls back with the transition", async () => {
    const { deps, sara, purchaseId } = await deliveredPurchase();
    const purchase = purchaseRow(deps, purchaseId);
    const cause = { from: "delivered", actorUserId: null, reason: "test" } as const;

    expect(completePurchaseTx(deps.db, purchase, cause, deps.clock.now())).toBe(true);
    expect(completePurchaseTx(deps.db, purchase, cause, deps.clock.now())).toBe(false);
    expect(payoutOf(deps, sara)).toBe(850);
    expect(purchaseRow(deps, purchaseId).status).toBe("completed");

    // A failing statushistorik insert rolls back both the status and the credit.
    const other = await deliveredPurchase(undefined, "NK-0000-0001");
    other.deps.db.run(sql`drop table status_history`);
    const row = purchaseRow(other.deps, other.purchaseId);
    expect(() => completePurchaseTx(other.deps.db, row, cause, other.deps.clock.now())).toThrow();
    expect(purchaseRow(other.deps, other.purchaseId).status).toBe("delivered");
    expect(payoutOf(other.deps, other.sara)).toBe(0);
  });

  it("buyer confirmation completes and credits once", async () => {
    const { deps, sara, kalle, lisa, listingId, purchaseId, code } = await deliveredPurchase();
    expect(payoutOf(deps, sara)).toBe(0);

    // Sara and Lisa are refused and change nothing.
    for (const other of [sara, lisa]) {
      await expect(confirmPurchase(deps, other, purchaseId)).rejects.toMatchObject({ code: "forbidden" });
    }
    expect(purchaseRow(deps, purchaseId).status).toBe("delivered");
    expect(payoutOf(deps, sara)).toBe(0);
    const historyBefore = historyOf(deps, "purchase", purchaseId).length;

    expect(await confirmPurchase(deps, kalle, purchaseId)).toEqual({ kind: "settled", status: "completed" });
    expect(purchaseRow(deps, purchaseId).status).toBe("completed");
    const history = historyOf(deps, "purchase", purchaseId);
    expect(history).toHaveLength(historyBefore + 1);
    expect(history.at(-1)).toMatchObject({
      fromStatus: "delivered",
      toStatus: "completed",
      actorUserId: kalle,
      reason: "köparen bekräftade",
    });
    expect(payoutOf(deps, sara)).toBe(850);
    expect(listingRow(deps.db, listingId).status).toBe("sold");
    expect(getPurchaseForBuyer(deps.db, kalle, purchaseId).giftCardCode).toBe(code);

    // A repeat shows the current status and credits nothing more.
    expect(await confirmPurchase(deps, kalle, purchaseId)).toEqual({ kind: "unchanged", status: "completed" });
    const completedRows = historyOf(deps, "purchase", purchaseId).filter((h) => h.toStatus === "completed");
    expect(completedRows).toHaveLength(1);
    expect(payoutOf(deps, sara)).toBe(850);

    // Concurrent double submit on a second köp: one Avslutat row, one credit.
    const second = await deliveredPurchase(deps, "NK-0000-0002");
    const outcomes = await Promise.all([
      confirmPurchase(deps, kalle, second.purchaseId),
      confirmPurchase(deps, kalle, second.purchaseId),
    ]);
    expect(outcomes.map((o) => o.kind).sort()).toEqual(["settled", "unchanged"]);
    expect(historyOf(deps, "purchase", second.purchaseId).filter((h) => h.toStatus === "completed")).toHaveLength(1);
    expect(payoutOf(deps, sara)).toBe(1700);
  });
});
