import { and, desc, eq, gt, inArray } from "drizzle-orm";
import type { VerificationResult } from "@/adapters/gift-card-verifier";
import type { AuthorizationResult } from "@/adapters/payment-provider";
import type { Db } from "@/db/client";
import { listings, merchants, purchases, type PurchaseStatus } from "@/db/schema";
import { isPastValidity } from "./dates";
import type { Deps } from "./deps";
import { DomainError, isDomainError } from "./errors";
import { expireDue } from "./expire-due";
import { checkGiftCard } from "./gift-card-check";
import { giftCardCodeFor, giftCardCodeForVerification } from "./gift-card-code";
import { kronor } from "./money";
import { type FailureCause, failPurchaseTx } from "./purchase-failure";
import { transition } from "./transition";

export type PurchaseView = {
  id: number;
  listingId: number;
  status: PurchaseStatus;
  amount: number;
  merchantId: string;
  merchantName: string;
  balance: number;
  validUntil: string;
  reservedUntil: Date | null;
  createdAt: Date;
  deliveredAt: Date | null;
  /** The köp's orsak once it is Misslyckat. */
  failureReason: string | null;
  /** Present only after leverans. */
  giftCardCode?: string;
};

/** Every köp status before leverans: the köp is ongoing and holds the annons's reservation. */
const ONGOING_STATUSES = ["started", "authorized"] as const;

/**
 * Reserves an Aktiv annons for the köpare and creates the köp as Påbörjat, atomically. The
 * annons's säljare is refused; a köpare who already has an ongoing köp of it gets that köp back.
 */
export function startPurchase(deps: Deps, buyerId: number, listingId: number): number {
  const now = deps.clock.now();
  const unavailable = new DomainError("listing_unavailable", "Annonsen är redan reserverad eller inte längre tillgänglig.");
  return deps.db.transaction((tx) => {
    const listing = tx
      .select({ price: listings.price, sellerId: listings.sellerId })
      .from(listings)
      .where(eq(listings.id, listingId))
      .get();
    if (!listing) throw new DomainError("not_found", "Annonsen finns inte.");
    if (listing.sellerId === buyerId) throw new DomainError("forbidden", "Du kan inte köpa din egen annons.");
    const ongoing = tx
      .select({ id: purchases.id })
      .from(purchases)
      .where(
        and(
          eq(purchases.listingId, listingId),
          eq(purchases.buyerId, buyerId),
          inArray(purchases.status, [...ONGOING_STATUSES]),
        ),
      )
      .get();
    if (ongoing) return ongoing.id;
    try {
      transition(tx, {
        entity: "listing",
        id: listingId,
        from: "active",
        to: "reserved",
        actorUserId: buyerId,
        reason: `reserverad i ${Math.round(deps.config.reservationMs / 60_000)} min`,
        at: now,
        set: { reservedById: buyerId, reservedUntil: new Date(now.getTime() + deps.config.reservationMs) },
      });
    } catch (e) {
      if (isDomainError(e) && e.code === "transition_conflict") throw unavailable;
      throw e;
    }
    return transition(tx, {
      entity: "purchase",
      from: null,
      to: "started",
      actorUserId: buyerId,
      reason: `belopp låst till ${listing.price} kr`,
      at: now,
      values: { listingId, buyerId, amount: listing.price, createdAt: now },
    });
  });
}

function purchaseById(db: Db, purchaseId: number) {
  const purchase = db.select().from(purchases).where(eq(purchases.id, purchaseId)).get();
  if (!purchase) throw new DomainError("not_found", "Köpet finns inte.");
  return purchase;
}

function purchaseOwnedBy(db: Db, buyerId: number, purchaseId: number) {
  const purchase = purchaseById(db, purchaseId);
  if (purchase.buyerId !== buyerId) throw new DomainError("forbidden", "Det här köpet är inte ditt.");
  return purchase;
}

/** Where a betalningsbesked led. `unchanged`: already handled, with the köp's current status. */
export type PaymentOutcome =
  | { kind: "delivered" }
  | {
      kind: "failed";
      reason: string;
      /** Set when the butikskontroll at köp reported a lower saldo than the annons's. */
      balanceMismatch?: { reported: number; advertised: number };
    }
  | { kind: "unchanged"; status: PurchaseStatus };

const PAYMENT_DECLINED = "betalningen nekades";

function unchanged(db: Db, purchaseId: number): PaymentOutcome {
  return { kind: "unchanged", status: purchaseById(db, purchaseId).status };
}

/** The "Simulerad betalning" step's approve, for the köp's köpare only. */
export function approvePayment(deps: Deps, buyerId: number, purchaseId: number): Promise<PaymentOutcome> {
  return pay(deps, buyerId, purchaseId, true);
}

/** The "Simulerad betalning" step's "Neka betalningen", for the köp's köpare only. */
export function declinePayment(deps: Deps, buyerId: number, purchaseId: number): Promise<PaymentOutcome> {
  return pay(deps, buyerId, purchaseId, false);
}

async function pay(deps: Deps, buyerId: number, purchaseId: number, approve: boolean): Promise<PaymentOutcome> {
  const purchase = purchaseOwnedBy(deps.db, buyerId, purchaseId);
  if (purchase.status !== "started") {
    throw new DomainError("wrong_purchase_status", "Betalningen för köpet är redan behandlad.");
  }
  const answer = await deps.payments.authorize({ amount: purchase.amount, approve });
  return receivePaymentAnswer(deps, purchaseId, answer);
}

/**
 * The betalningsbesked for a köp. Safe to receive more than once or late: only the besked whose
 * Påbörjat → Betalning auktoriserad transition changes a row goes on to the butikskontroll and
 * leverans; any other returns the köp's current status and releases its own fresh authorization.
 */
export async function receivePaymentAnswer(
  deps: Deps,
  purchaseId: number,
  answer: AuthorizationResult,
): Promise<PaymentOutcome> {
  const purchase = purchaseById(deps.db, purchaseId);
  if (answer.outcome === "declined") {
    const cause = { reason: PAYMENT_DECLINED, actorUserId: purchase.buyerId, listingTo: "active" } as const;
    return failPurchaseTx(deps.db, purchase, "started", cause, deps.clock.now())
      ? { kind: "failed", reason: PAYMENT_DECLINED }
      : unchanged(deps.db, purchaseId);
  }

  const { authorizationId } = answer;
  try {
    transition(deps.db, {
      entity: "purchase",
      id: purchaseId,
      from: "started",
      to: "authorized",
      actorUserId: null,
      reason: "betalning auktoriserad (simulerat)",
      at: deps.clock.now(),
      set: { authorizationId },
    });
  } catch (e) {
    if (!(isDomainError(e) && e.code === "transition_conflict")) throw e;
    // A repeat of the besked already handled keeps its authorization; any other is released.
    if (purchaseById(deps.db, purchaseId).authorizationId !== authorizationId) {
      await deps.payments.void(authorizationId);
    }
    return unchanged(deps.db, purchaseId);
  }

  const listing = deps.db
    .select({ balance: listings.balance })
    .from(listings)
    .where(eq(listings.id, purchase.listingId))
    .get()!;
  const check = await checkGiftCard(deps, {
    code: giftCardCodeForVerification(deps.db, purchase.listingId),
    declaredBalance: listing.balance,
    phase: "purchase",
  });
  const failure = failureOf(check, listing.balance);
  if (!failure) return deliverPurchase(deps, purchaseId);

  if (!failPurchaseTx(deps.db, purchase, "authorized", failure.cause, deps.clock.now())) {
    return unchanged(deps.db, purchaseId);
  }
  await deps.payments.void(authorizationId);
  return { kind: "failed", reason: failure.cause.reason, balanceMismatch: failure.balanceMismatch };
}

type CheckFailure = { cause: FailureCause; balanceMismatch?: { reported: number; advertised: number } };

/** The failure a butikskontroll answer at köp causes, or undefined when it allows leverans. */
function failureOf(check: VerificationResult, advertised: number): CheckFailure | undefined {
  switch (check.outcome) {
    case "invalid":
      return {
        cause: { reason: "butiken godkände inte koden", actorUserId: null, listingTo: "flagged", flagReason: "ogiltig kod" },
      };
    case "no_response":
      return { cause: { reason: "butikskontrollen svarade inte", actorUserId: null, listingTo: "active" } };
    case "error":
      return { cause: { reason: "butikskontrollen svarade med fel", actorUserId: null, listingTo: "active" } };
    case "valid":
      if (check.balance >= advertised) return undefined;
      return {
        cause: {
          reason: `saldoavvikelse: butiken anger ${kronor(check.balance)} i stället för annonserade ${kronor(advertised)}`,
          actorUserId: null,
          listingTo: "flagged",
          flagReason: "saldoavvikelse",
        },
        balanceMismatch: { reported: check.balance, advertised },
      };
  }
}

/**
 * Leverans's single commit point: one transaction, conditional on the köp being Betalning
 * auktoriserad, the reservation not yet run out and the giltighet not yet ended, moves the köp to
 * Levererat and the annons to Såld; the dragning follows the commit. When the commit changes
 * nothing, a lapsed reservation or giltighet is expired and the köp's current status returned, so
 * expiry and leverans never both apply.
 */
export async function deliverPurchase(deps: Deps, purchaseId: number): Promise<PaymentOutcome> {
  const purchase = purchaseById(deps.db, purchaseId);
  const now = deps.clock.now();
  try {
    deps.db.transaction((tx) => {
      // FR5/FR8: never deliver a card whose giltighet has ended. Read inside the transaction, so
      // it holds at the commit.
      const { validUntil } = tx
        .select({ validUntil: listings.validUntil })
        .from(listings)
        .where(eq(listings.id, purchase.listingId))
        .get()!;
      if (isPastValidity(validUntil, now)) {
        throw new DomainError("transition_conflict", "Kortets giltighetsdatum har passerat.");
      }
      transition(tx, {
        entity: "purchase",
        id: purchaseId,
        from: "authorized",
        to: "delivered",
        actorUserId: null,
        reason: "kontrollerad vid köp (simulerat), betalning dragen och kod levererad",
        at: now,
        set: { deliveredAt: now },
      });
      transition(tx, {
        entity: "listing",
        id: purchase.listingId,
        from: "reserved",
        to: "sold",
        actorUserId: null,
        reason: "såld",
        at: now,
        guard: { reservedById: purchase.buyerId },
        condition: gt(listings.reservedUntil, now),
        set: { reservedById: null, reservedUntil: null },
      });
    });
  } catch (e) {
    if (!(isDomainError(e) && e.code === "transition_conflict")) throw e;
    await expireDue(deps, now);
    return unchanged(deps.db, purchaseId);
  }
  await deps.payments.capture(purchase.authorizationId!);
  return { kind: "delivered" };
}

function toView(db: Db, viewerId: number, row: Omit<PurchaseView, "giftCardCode">): PurchaseView {
  const giftCardCode = row.status === "delivered" ? giftCardCodeFor(db, viewerId, row.listingId) : undefined;
  return giftCardCode ? { ...row, giftCardCode } : row;
}

const viewColumns = {
  id: purchases.id,
  listingId: purchases.listingId,
  status: purchases.status,
  amount: purchases.amount,
  merchantId: listings.merchantId,
  merchantName: merchants.name,
  balance: listings.balance,
  validUntil: listings.validUntil,
  reservedUntil: listings.reservedUntil,
  createdAt: purchases.createdAt,
  deliveredAt: purchases.deliveredAt,
  failureReason: purchases.failureReason,
};

function selectPurchaseViews(db: Db) {
  return db
    .select(viewColumns)
    .from(purchases)
    .innerJoin(listings, eq(listings.id, purchases.listingId))
    .innerJoin(merchants, eq(merchants.id, listings.merchantId));
}

/** The köp as its köpare sees it; anyone else is refused. */
export function getPurchaseForBuyer(db: Db, viewerId: number, purchaseId: number): PurchaseView {
  purchaseOwnedBy(db, viewerId, purchaseId);
  const row = selectPurchaseViews(db).where(eq(purchases.id, purchaseId)).get()!;
  return toView(db, viewerId, row);
}

export function purchasesOfBuyer(db: Db, buyerId: number): PurchaseView[] {
  return selectPurchaseViews(db)
    .where(eq(purchases.buyerId, buyerId))
    .orderBy(desc(purchases.id))
    .all()
    .map((row) => toView(db, buyerId, row));
}
