import { and, asc, eq, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { listings, merchants, users, type ListingStatus } from "@/db/schema";
import type { Deps } from "./deps";
import { DomainError } from "./errors";
import { compareDiscountDesc, type ListingTerms, listingTerms } from "./listing-terms";
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

/** An annons as a köpare compares it: the code-free DTO plus rabatt, giltighet warning and kontrollstatus. */
export type ListingViewDto = ListingDto & ListingTerms;

/** Sökningen's sort keys: högst rabatt (default), lägst pris, längst kvarvarande giltighet. */
export const searchSorts = ["discount", "price", "validity"] as const;
export type SearchSort = (typeof searchSorts)[number];

export type SearchQuery = { merchantId?: string; sort?: SearchSort };

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

type SortableRow = ListingDto & { createdAt: Date };

const byOrder: Record<SearchSort, (a: SortableRow, b: SortableRow) => number> = {
  discount: compareDiscountDesc,
  price: (a, b) => a.price - b.price,
  // YYYY-MM-DD orders like the end instant it names.
  validity: (a, b) => b.validUntil.localeCompare(a.validUntil),
};

/** Ties in every sortering go to the earliest publication. */
const byPublication = (a: SortableRow, b: SortableRow) =>
  a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id;

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

/**
 * Sökningen: every Aktiv annons of other säljare, optionally at one handlare, ordered by the chosen
 * sortering (default högst rabatt) with ties to the earliest publication. Never carries the code.
 */
export function searchListings(
  deps: Pick<Deps, "db" | "clock">,
  viewerId: number,
  query: SearchQuery = {},
): ListingViewDto[] {
  const rows: SortableRow[] = deps.db
    .select({ ...dtoColumns, createdAt: listings.createdAt })
    .from(listings)
    .innerJoin(merchants, eq(merchants.id, listings.merchantId))
    .innerJoin(users, eq(users.id, listings.sellerId))
    .where(
      and(
        eq(listings.status, "active"),
        ne(listings.sellerId, viewerId),
        query.merchantId === undefined ? undefined : eq(listings.merchantId, query.merchantId),
      ),
    )
    .all();
  const order = byOrder[query.sort ?? "discount"];
  const now = deps.clock.now();
  return rows
    .sort((a, b) => order(a, b) || byPublication(a, b))
    .map(({ createdAt: _publishedAt, ...dto }) => ({ ...dto, ...listingTerms(dto, now) }));
}

export function getListing(db: Db, listingId: number): ListingDto | undefined {
  return selectListingDtos(db).where(eq(listings.id, listingId)).get();
}

/** The annons view: the code-free DTO with what a köpare needs before a köp. */
export function getListingView(deps: Pick<Deps, "db" | "clock">, listingId: number): ListingViewDto | undefined {
  const listing = getListing(deps.db, listingId);
  return listing && { ...listing, ...listingTerms(listing, deps.clock.now()) };
}

export function listingsOfSeller(db: Db, sellerId: number): ListingDto[] {
  return selectListingDtos(db)
    .where(eq(listings.sellerId, sellerId))
    .orderBy(asc(listings.id))
    .all();
}
