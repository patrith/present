import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { listings } from "@/db/schema";
import { giftCardCodeFor } from "@/domain/gift-card-code";
import { kr } from "@/domain/money";
import { searchListings } from "@/domain/listings";
import { approvePayment, getPurchaseForBuyer, startPurchase } from "@/domain/purchases";
import { historyOf, listingRow, makeTestDeps, publishNk, purchaseRow, userId } from "../helpers";

const cases = [
  { code: "ANVAND-NK-1", reason: "butiken godkände inte koden", listing: "flagged", flagReason: "ogiltig kod" },
  {
    code: "DELVIS-NK-1",
    reason: `saldoavvikelse: butiken anger ${kr(800)} i stället för annonserade ${kr(1000)}`,
    listing: "flagged",
    flagReason: "saldoavvikelse",
  },
  { code: "TIMEOUT-NK-1", reason: "butikskontrollen svarade inte", listing: "active", flagReason: null },
  { code: "FEL-NK-1", reason: "butikskontrollen svarade med fel", listing: "active", flagReason: null },
] as const;

describe("butikskontroll at purchase", () => {
  it("ANVAND DELVIS TIMEOUT FEL each fail without capture", async () => {
    for (const c of cases) {
      const deps = makeTestDeps();
      const kalle = userId(deps.db, "Kalle");
      // TIMEOUT and FEL never pass publicering, so the fixture swaps the code in after publishing.
      const listingId = await publishNk(deps);
      deps.db.update(listings).set({ giftCardCode: c.code }).where(eq(listings.id, listingId)).run();
      const purchaseId = startPurchase(deps, kalle, listingId);

      const outcome = await approvePayment(deps, kalle, purchaseId);

      expect(outcome).toMatchObject({ kind: "failed", reason: c.reason });
      if (c.code.startsWith("DELVIS")) {
        expect(outcome).toMatchObject({ balanceMismatch: { reported: 800, advertised: 1000 } });
      } else {
        expect(outcome).not.toHaveProperty("balanceMismatch.reported");
      }
      const purchase = purchaseRow(deps, purchaseId);
      expect(purchase).toMatchObject({ status: "failed", failureReason: c.reason });
      expect(listingRow(deps, listingId)).toMatchObject({
        status: c.listing,
        flagReason: c.flagReason,
        reservedById: null,
      });
      expect(searchListings(deps.db).some((l) => l.id === listingId)).toBe(c.listing === "active");

      // The authorization is released (one void), nothing is drawn.
      expect(deps.payments.countIn("voided")).toBe(1);
      expect(deps.payments.countIn("authorized")).toBe(0);
      expect(deps.payments.captureCount(purchase.authorizationId!)).toBe(0);

      // No presentkortskod for the köpare.
      expect(giftCardCodeFor(deps.db, kalle, listingId)).toBeUndefined();
      expect(JSON.stringify(getPurchaseForBuyer(deps.db, kalle, purchaseId))).not.toContain(c.code);

      // Both changes are in the statushistorik with orsak; a Flaggad annons's row holds its flaggningsorsak.
      expect(historyOf(deps, "purchase", purchaseId).at(-1)).toMatchObject({
        fromStatus: "authorized",
        toStatus: "failed",
        actorUserId: null,
        reason: c.reason,
      });
      expect(historyOf(deps, "listing", listingId).at(-1)).toMatchObject({
        fromStatus: "reserved",
        toStatus: c.listing,
        reason: c.flagReason ?? c.reason,
      });
    }
  });
});
