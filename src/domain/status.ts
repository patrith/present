import type { ListingStatus, PurchaseStatus } from "@/db/schema";

/** Swedish UI names for the code status vocabulary. */
export const listingStatusLabel: Record<ListingStatus, string> = {
  active: "Aktiv",
  reserved: "Reserverad",
  sold: "Såld",
  flagged: "Flaggad",
  expired: "Utgången",
  withdrawn: "Återkallad",
};

export const purchaseStatusLabel: Record<PurchaseStatus, string> = {
  started: "Påbörjat",
  authorized: "Betalning auktoriserad",
  delivered: "Levererat",
  completed: "Avslutat",
  failed: "Misslyckat",
  disputed: "Tvist",
  refunded: "Återbetalat",
};
