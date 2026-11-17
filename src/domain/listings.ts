import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { listingCodes, listings, merchants, users, type ListingStatus } from "@/db/schema";
import type { Clock } from "./clock";
import { stockholmDate } from "./dates";
import type { Deps } from "./deps";
import { DomainError, isDomainError } from "./errors";
import { giftCardCodeFor } from "./gift-card-code";
import { checkGiftCard, publishCheckRefusal } from "./gift-card-check";
import { kronor } from "./money";
import { listingStatusLabel } from "./status";
import { type DbOrTx, transition } from "./transition";

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
  /** Flaggningsorsak while Flaggad, e.g. "saldoavvikelse". */
  flagReason: string | null;
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
  flagReason: listings.flagReason,
};

/** Annonser joined with their handlare and säljare, selecting only ListingDto columns. */
function selectListingDtos(db: Db) {
  return db
    .select(dtoColumns)
    .from(listings)
    .innerJoin(merchants, eq(merchants.id, listings.merchantId))
    .innerJoin(users, eq(users.id, listings.sellerId));
}

export function listMerchants(db: Db): { id: string; name: string }[] {
  return db.select().from(merchants).orderBy(asc(merchants.name)).all();
}

const invalid = (message: string, field: string) => new DomainError("invalid_input", message, field);

/** A real calendar date written YYYY-MM-DD. */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateCodeAndAmounts(giftCardCode: string, balance: number, price: number): void {
  if (giftCardCode.trim() === "") throw invalid("Ange presentkortskoden.", "giftCardCode");
  if (!Number.isInteger(balance) || balance <= 0) throw invalid("Ange saldot i hela kronor.", "balance");
  if (!Number.isInteger(price)) throw invalid("Ange priset i hela kronor.", "price");
}

function validatePublishInput(db: Db, input: PublishInput): void {
  if (!db.select({ id: merchants.id }).from(merchants).where(eq(merchants.id, input.merchantId)).get())
    throw invalid("Välj en handlare i listan.", "merchantId");
  validateCodeAndAmounts(input.giftCardCode, input.balance, input.price);
  if (!isCalendarDate(input.validUntil)) throw invalid("Ange giltighetsdatum.", "validUntil");
}

/** Prisregeln: 0 kr < pris < saldo. */
function assertPriceRule(price: number, balance: number): void {
  if (price <= 0 || price >= balance) {
    throw invalid(`Priset måste vara större än 0 kr och lägre än saldot ${kronor(balance)}.`, "price");
  }
}

/** A giltighetsdatum is valid to the end of its day in Swedish time. */
function assertNotExpired(clock: Clock, validUntil: string): void {
  if (validUntil < stockholmDate(clock.now())) {
    throw invalid("Giltighetsdatumet har passerat. Ett kort som har gått ut kan inte säljas.", "validUntil");
  }
}

const duplicateCode = () =>
  new DomainError(
    "duplicate_code",
    "Presentkortskoden har redan förekommit i en annons hos den här handlaren och kan inte annonseras igen.",
    "giftCardCode",
  );

/** Dubblettkontroll: a code once held by any annons for a handlare is never listed again for it. */
function assertCodeNeverListed(db: Db, merchantId: string, giftCardCode: string): void {
  const held = db
    .select({ id: listingCodes.id })
    .from(listingCodes)
    .where(and(eq(listingCodes.merchantId, merchantId), eq(listingCodes.giftCardCode, giftCardCode)))
    .get();
  if (held) throw duplicateCode();
}

/** A concurrent duplicate that passed the pre-check fails on the unique index: report it as one. */
function duplicateOr(e: unknown): unknown {
  const sqliteCode = (e as { code?: unknown } | null)?.code;
  return sqliteCode === "SQLITE_CONSTRAINT_UNIQUE" && String((e as Error).message).includes("listing_codes")
    ? duplicateCode()
    : e;
}

function recordCode(db: DbOrTx, listingId: number, merchantId: string, giftCardCode: string): void {
  db.insert(listingCodes).values({ listingId, merchantId, giftCardCode }).run();
}

export type NewListing = PublishInput & { sellerId: number };

/**
 * Creates an Aktiv annons and records its presentkortskod for the dubblettkontroll, in one
 * transaction (joining the caller's). Used by publicering and the demo seed.
 */
export function insertActiveListing(db: DbOrTx, listing: NewListing, at: Date): number {
  return db.transaction((tx) => {
    const id = transition(tx, {
      entity: "listing",
      from: null,
      to: "active",
      actorUserId: listing.sellerId,
      reason: PUBLISH_REASON,
      at,
      values: { ...listing, createdAt: at },
    });
    recordCode(tx, id, listing.merchantId, listing.giftCardCode);
    return id;
  });
}

/**
 * Publicering: inputs, prisregel and giltighetsdatum, then the dubblettkontroll, then the
 * butikskontroll; only giltig with the same saldo creates the annons as Aktiv.
 */
export async function publishListing(deps: Deps, sellerId: number, input: PublishInput): Promise<number> {
  validatePublishInput(deps.db, input);
  const giftCardCode = input.giftCardCode.trim();
  assertPriceRule(input.price, input.balance);
  assertNotExpired(deps.clock, input.validUntil);
  assertCodeNeverListed(deps.db, input.merchantId, giftCardCode);
  const check = await checkGiftCard(deps, { code: giftCardCode, declaredBalance: input.balance, phase: "publish" });
  const refused = publishCheckRefusal(check, input.balance);
  if (refused) throw refused;
  try {
    return insertActiveListing(deps.db, { ...input, giftCardCode, sellerId }, deps.clock.now());
  } catch (e) {
    throw duplicateOr(e);
  }
}

/** Unknown annons and someone else's annons are refused alike, so an annons id reveals nothing. */
const notFoundOrNotYours = () => new DomainError("not_found", "Annonsen finns inte eller är inte din.");

function ownListing(db: Db, userId: number, listingId: number) {
  const row = db
    .select({
      sellerId: listings.sellerId,
      merchantId: listings.merchantId,
      balance: listings.balance,
      price: listings.price,
      status: listings.status,
    })
    .from(listings)
    .where(eq(listings.id, listingId))
    .get();
  if (!row || row.sellerId !== userId) throw notFoundOrNotYours();
  return { ...row, giftCardCode: giftCardCodeFor(db, userId, listingId)! };
}

/** The säljare may change or withdraw an annons only while it is Aktiv or Flaggad. */
function changeableStatus(status: ListingStatus, verb: string): "active" | "flagged" {
  if (status === "active" || status === "flagged") return status;
  throw new DomainError("listing_locked", `Annonsen har status ${listingStatusLabel[status]} och kan inte ${verb}.`);
}

/** After the conditional write found the status changed meanwhile: refuse with the status now. */
function refuseWithCurrentStatus(db: Db, listingId: number, verb: string): never {
  const row = db.select({ status: listings.status }).from(listings).where(eq(listings.id, listingId)).get()!;
  changeableStatus(row.status, verb);
  throw new DomainError("listing_locked", "Annonsen ändrades samtidigt. Ladda om sidan och försök igen.");
}

export type ListingChanges = { giftCardCode?: string; balance?: number; price?: number };

/**
 * The säljare changes pris, presentkortskod or saldo of an Aktiv or Flaggad annons. A pris-only
 * change on an Aktiv annons saves under the prisregel without a butikskontroll; a changed code or
 * saldo also takes the dubblettkontroll and a new butikskontroll at publicering phase, and only
 * giltig with the same saldo saves it – leaving the annons Aktiv with its flaggningsorsak cleared.
 * The write is conditioned on the status read before the butikskontroll (ADR-003).
 */
export async function editListing(
  deps: Deps,
  userId: number,
  listingId: number,
  changes: ListingChanges,
): Promise<void> {
  const verb = "ändras";
  const listing = ownListing(deps.db, userId, listingId);
  const from = changeableStatus(listing.status, verb);
  const giftCardCode = changes.giftCardCode?.trim() ?? listing.giftCardCode;
  const balance = changes.balance ?? listing.balance;
  const price = changes.price ?? listing.price;
  validateCodeAndAmounts(giftCardCode, balance, price);

  const codeChanged = giftCardCode !== listing.giftCardCode;
  const balanceChanged = balance !== listing.balance;
  const needsCheck = codeChanged || balanceChanged;
  if (!needsCheck && from === "flagged") {
    throw new DomainError(
      "invalid_input",
      "En flaggad annons kan inte bara få nytt pris. Rätta presentkortskoden eller saldot.",
    );
  }
  if (!needsCheck && price === listing.price) throw invalid("Ange ett nytt pris.", "price");
  assertPriceRule(price, balance);
  if (codeChanged) assertCodeNeverListed(deps.db, listing.merchantId, giftCardCode);
  if (needsCheck) {
    const check = await checkGiftCard(deps, { code: giftCardCode, declaredBalance: balance, phase: "publish" });
    const refused = publishCheckRefusal(check, balance);
    if (refused) throw refused;
  }

  const changed = [
    codeChanged && "presentkortskod ändrad",
    balanceChanged && `saldo ${kronor(listing.balance)} → ${kronor(balance)}`,
    price !== listing.price && `pris ${kronor(listing.price)} → ${kronor(price)}`,
  ].filter(Boolean);
  const checked = needsCheck ? ", kontrollerad (simulerat)" : "";
  const reason = `${from === "flagged" ? "rättad" : "ändrad"}: ${changed.join(", ")}${checked}`;
  try {
    deps.db.transaction((tx) => {
      transition(tx, {
        entity: "listing",
        id: listingId,
        from,
        to: "active",
        actorUserId: userId,
        reason,
        at: deps.clock.now(),
        set: { giftCardCode, balance, price, flagReason: null },
      });
      if (codeChanged) recordCode(tx, listingId, listing.merchantId, giftCardCode);
    });
  } catch (e) {
    if (isDomainError(e) && e.code === "transition_conflict") refuseWithCurrentStatus(deps.db, listingId, verb);
    throw duplicateOr(e);
  }
}

/** Återkallelse: the säljare withdraws an Aktiv or Flaggad annons, which leaves sökningen. */
export function withdrawListing(deps: Pick<Deps, "db" | "clock">, userId: number, listingId: number): void {
  const verb = "återkallas";
  const listing = ownListing(deps.db, userId, listingId);
  const from = changeableStatus(listing.status, verb);
  try {
    transition(deps.db, {
      entity: "listing",
      id: listingId,
      from,
      to: "withdrawn",
      actorUserId: userId,
      reason: "återkallad av säljaren",
      at: deps.clock.now(),
    });
  } catch (e) {
    if (isDomainError(e) && e.code === "transition_conflict") refuseWithCurrentStatus(deps.db, listingId, verb);
    throw e;
  }
}

/** Sökningen: every Aktiv annons (filters, sorting and own-listing exclusion: story S04). */
export function searchListings(db: Db): ListingDto[] {
  return selectListingDtos(db)
    .where(eq(listings.status, "active"))
    .orderBy(asc(listings.id))
    .all();
}

export function getListing(db: Db, listingId: number): ListingDto | undefined {
  return selectListingDtos(db).where(eq(listings.id, listingId)).get();
}

export function listingsOfSeller(db: Db, sellerId: number): ListingDto[] {
  return selectListingDtos(db)
    .where(eq(listings.sellerId, sellerId))
    .orderBy(asc(listings.id))
    .all();
}
