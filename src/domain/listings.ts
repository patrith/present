import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { listings, merchants, users, type ListingStatus } from "@/db/schema";
import type { Deps } from "./deps";
import { DomainError } from "./errors";
import { transition } from "./transition";

/** What anyone may see of an annons. Never carries the presentkortskod. */
export type ListingDto = {
  id: number;
  sellerId: number;
  sellerFirstName: string;
  merchantId: string;
  merchantName: string;
  balance: number;
  price: number;
  validUntil: string;
  status: ListingStatus;
};

export type PublishInput = {
  merchantId: string;
  giftCardCode: string;
  balance: number;
  price: number;
  validUntil: string;
};

export const PUBLISH_REASON = "kontrollerad vid publicering (simulerat)";

const dtoColumns = {
  id: listings.id,
  sellerId: listings.sellerId,
  sellerFirstName: users.firstName,
  merchantId: listings.merchantId,
  merchantName: merchants.name,
  balance: listings.balance,
  price: listings.price,
  validUntil: listings.validUntil,
  status: listings.status,
};

export function listMerchants(db: Db): { id: string; name: string }[] {
  return db.select().from(merchants).orderBy(asc(merchants.name)).all();
}

function validatePublishInput(db: Db, input: PublishInput): void {
  const invalid = (msg: string) => new DomainError("invalid_input", msg);
  if (!db.select({ id: merchants.id }).from(merchants).where(eq(merchants.id, input.merchantId)).get())
    throw invalid("Välj en handlare i listan.");
  if (input.giftCardCode.trim() === "") throw invalid("Ange presentkortskoden.");
  if (!Number.isInteger(input.balance) || input.balance <= 0) throw invalid("Ange saldot i hela kronor.");
  if (!Number.isInteger(input.price) || input.price <= 0) throw invalid("Ange priset i hela kronor.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.validUntil)) throw invalid("Ange giltighetsdatum.");
}

/**
 * Runs the butikskontroll at publicering and, when it answers giltig with the same saldo,
 * creates the annons as Aktiv. Any other outcome creates nothing (specific messages: story S03).
 */
export async function publishListing(deps: Deps, sellerId: number, input: PublishInput): Promise<number> {
  validatePublishInput(deps.db, input);
  const giftCardCode = input.giftCardCode.trim();
  const check = await deps.verifier.verify({ code: giftCardCode, declaredBalance: input.balance, phase: "publish" });
  if (check.outcome !== "valid" || check.balance !== input.balance) {
    throw new DomainError("verification_failed", "Butikskontrollen godkände inte kortet. Annonsen publicerades inte.");
  }
  const now = deps.clock.now();
  return transition(deps.db, {
    entity: "listing",
    from: null,
    to: "active",
    actorUserId: sellerId,
    reason: PUBLISH_REASON,
    at: now,
    values: {
      sellerId,
      merchantId: input.merchantId,
      giftCardCode,
      balance: input.balance,
      price: input.price,
      validUntil: input.validUntil,
      createdAt: now,
    },
  });
}

/** Sökningen: every Aktiv annons (filters, sorting and own-listing exclusion: story S04). */
export function searchListings(db: Db): ListingDto[] {
  return db
    .select(dtoColumns)
    .from(listings)
    .innerJoin(merchants, eq(merchants.id, listings.merchantId))
    .innerJoin(users, eq(users.id, listings.sellerId))
    .where(eq(listings.status, "active"))
    .orderBy(asc(listings.id))
    .all();
}

export function getListing(db: Db, listingId: number): ListingDto | undefined {
  return db
    .select(dtoColumns)
    .from(listings)
    .innerJoin(merchants, eq(merchants.id, listings.merchantId))
    .innerJoin(users, eq(users.id, listings.sellerId))
    .where(eq(listings.id, listingId))
    .get();
}

export function listingsOfSeller(db: Db, sellerId: number): ListingDto[] {
  return db
    .select(dtoColumns)
    .from(listings)
    .innerJoin(merchants, eq(merchants.id, listings.merchantId))
    .innerJoin(users, eq(users.id, listings.sellerId))
    .where(eq(listings.sellerId, sellerId))
    .orderBy(asc(listings.id))
    .all();
}
