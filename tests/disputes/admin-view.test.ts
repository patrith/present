import { describe, expect, it } from "vitest";
import { getDisputesPage } from "@/domain/disputes";
import { claimPurchase } from "@/domain/purchases";
import { historyOf } from "../helpers";
import { deliveredPurchase } from "../purchases/delivered";

const MOTIVATION = "Kassan sa att koden redan är använd";

describe("Tvister", () => {
  it("admin sees motivation and history but never the code", async () => {
    const { deps, sara, kalle, lisa, admin, purchaseId, code } = await deliveredPurchase();
    expect(getDisputesPage(deps.db, admin)).toEqual({ disputes: [], emptyText: "Inga öppna tvister." });

    await claimPurchase(deps, kalle, purchaseId, MOTIVATION);
    const page = getDisputesPage(deps.db, admin);
    expect(page.emptyText).toBeUndefined();
    expect(page.disputes).toHaveLength(1);
    const [d] = page.disputes;
    expect(d).toMatchObject({
      purchaseId,
      merchantName: "Nordiska Kompagniet",
      amount: 850,
      buyerName: "Kalle Berg",
      sellerName: "Sara Lind",
      claimReason: MOTIVATION,
    });
    const history = historyOf(deps, "purchase", purchaseId);
    expect(d.history).toHaveLength(history.length);
    expect(d.history.map((h) => h.reason)).toEqual(history.map((h) => h.reason));
    expect(d.history.at(-1)).toMatchObject({ actor: "Kalle Berg", reason: "köparen reklamerade", status: "Tvist" });
    expect(d.history.some((h) => h.actor === "system")).toBe(true);
    for (const h of d.history) expect(h.at).toBeInstanceOf(Date);

    // The serialized page data never carries the presentkortskod.
    expect(JSON.stringify(page)).not.toContain(code);

    // Anyone but the demoadministratör is refused.
    for (const other of [kalle, sara, lisa]) {
      expect(() => getDisputesPage(deps.db, other)).toThrow(expect.objectContaining({ code: "forbidden" }));
    }
  });
});
