import { desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { listings, merchants, purchases, type PurchaseStatus } from "@/db/schema";
import type { Deps } from "./deps";
import { DomainError, isDomainError } from "./errors";
import { giftCardCodeFor, giftCardCodeForVerification } from "./gift-card-code";
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
  /** Present only after leverans. */
  giftCardCode?: string;
};

/** Reserves an Aktiv annons for the köpare and creates the köp as Påbörjat, atomically. */
export function startPurchase(deps: Deps, buyerId: number, listingId: number): number {
  const now = deps.clock.now();
  const unavailable = new DomainError("listing_unavailable", "Annonsen är redan reserverad eller inte längre tillgänglig.");
  return deps.db.transaction((tx) => {
    const listing = tx.select({ price: listings.price }).from(listings).where(eq(listings.id, listingId)).get();
    if (!listing) throw new DomainError("not_found", "Annonsen finns inte.");
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

function purchaseOwnedBy(db: Db, buyerId: number, purchaseId: number) {
  const purchase = db.select().from(purchases).where(eq(purchases.id, purchaseId)).get();
  if (!purchase) throw new DomainError("not_found", "Köpet finns inte.");
  if (purchase.buyerId !== buyerId) throw new DomainError("forbidden", "Det här köpet är inte ditt.");
  return purchase;
}

/**
 * The köpare approves the simulated payment: authorize → butikskontroll at köp → on giltig with
 * at least the annons's saldo, leverans (köp Levererat, annons Såld) commits and then the
 * authorization is captured. Any other outcome stops before capture (its handling: story S05).
 */
export async function approvePayment(
  deps: Deps,
  buyerId: number,
  purchaseId: number,
): Promise<"delivered" | "check_failed"> {
  const purchase = purchaseOwnedBy(deps.db, buyerId, purchaseId);
  if (purchase.status !== "started") {
    throw new DomainError("wrong_purchase_status", "Betalningen för köpet är redan behandlad.");
  }
  const authorization = await deps.payments.authorize({ amount: purchase.amount, approve: true });
  if (authorization.outcome !== "authorized") {
    throw new DomainError("payment_declined", "Betalningen nekades.");
  }
  transition(deps.db, {
    entity: "purchase",
    id: purchaseId,
    from: "started",
    to: "authorized",
    actorUserId: null,
    reason: "betalning auktoriserad (simulerat)",
    at: deps.clock.now(),
    set: { authorizationId: authorization.authorizationId },
  });

  const listing = deps.db
    .select({ balance: listings.balance })
    .from(listings)
    .where(eq(listings.id, purchase.listingId))
    .get()!;
  const check = await deps.verifier.verify({
    code: giftCardCodeForVerification(deps.db, purchase.listingId),
    declaredBalance: listing.balance,
    phase: "purchase",
  });
  if (check.outcome !== "valid" || check.balance < listing.balance) return "check_failed";

  const now = deps.clock.now();
  deps.db.transaction((tx) => {
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
      guard: { reservedById: buyerId },
      set: { reservedById: null, reservedUntil: null },
    });
  });
  await deps.payments.capture(authorization.authorizationId);
  return "delivered";
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
