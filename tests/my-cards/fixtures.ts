import { expireDue } from "@/domain/expire-due";
import { publishListing, withdrawListing } from "@/domain/listings";
import {
  approvePayment,
  claimPurchase,
  confirmPurchase,
  declinePayment,
  decideDispute,
  startPurchase,
} from "@/domain/purchases";
import { makeTestDeps, publishNk, userId } from "../helpers";

// Shared fixture for the mina kort tests (story S08). Not a test file itself.

/**
 * Sara's annonser in all six statuses and Kalle's köp in every status of scenarios S01 and S02,
 * each reached through the real flows; Sara's utbetalningssaldo is 850 kr from the Avslutat köp.
 */
export async function everyStatus() {
  const deps = makeTestDeps();
  const [sara, kalle, lisa, admin] = (["Sara", "Kalle", "Lisa", "Demo"] as const).map((n) => userId(deps.db, n));

  // Utgången first: its giltighetsdatum 2026-11-17 passes at midnight, then the rest happen on the 18th.
  const expired = await publishListing(deps, sara, {
    merchantId: "ICA",
    giftCardCode: "ICA-EXPIRED-1",
    balance: 500,
    price: 400,
    validUntil: "2026-11-17",
  });
  deps.clock.advance(new Date("2026-11-18T09:00:00+01:00").getTime() - deps.clock.now().getTime());
  await expireDue(deps, deps.clock.now());

  const withdrawn = await publishNk(deps, "NK-WITHDRAWN-1");
  withdrawListing(deps, sara, withdrawn);

  const delivered = await buy(await publishNk(deps, "NK-DELIVERED-1"));
  const completedListing = await publishNk(deps, "NK-COMPLETED-1");
  const completed = await buy(completedListing);
  await confirmPurchase(deps, kalle, completed);
  const disputed = await buy(await publishNk(deps, "NK-DISPUTED-1"));
  await claimPurchase(deps, kalle, disputed, "Kassan sa att koden redan är använd");
  const refunded = await buy(await publishNk(deps, "NK-REFUNDED-1"));
  await claimPurchase(deps, kalle, refunded, "Koden fungerade inte");
  await decideDispute(deps, admin, refunded, "refund");

  const declined = startPurchase(deps, kalle, await publishNk(deps, "NK-DECLINED-1"));
  await declinePayment(deps, kalle, declined);

  // The butikskontroll at köp reports 200 kr less: the köp fails, the annons is Flaggad (saldoavvikelse).
  const flagged = await publishNk(deps, "DELVIS-FLAGGED-1");
  const balanceMismatch = startPurchase(deps, kalle, flagged);
  await approvePayment(deps, kalle, balanceMismatch);

  const active = await publishNk(deps, "NK-ACTIVE-1");
  const reserved = await publishNk(deps, "NK-RESERVED-1");
  const started = startPurchase(deps, kalle, reserved);

  return {
    deps,
    sara,
    kalle,
    lisa,
    listings: { active, reserved, sold: completedListing, flagged, expired, withdrawn },
    purchases: { started, delivered, completed, disputed, refunded, declined, balanceMismatch },
  };

  async function buy(listingId: number): Promise<number> {
    const purchaseId = startPurchase(deps, kalle, listingId);
    const outcome = await approvePayment(deps, kalle, purchaseId);
    if (outcome.kind !== "delivered") throw new Error(`expected leverans, got ${outcome.kind}`);
    return purchaseId;
  }
}
