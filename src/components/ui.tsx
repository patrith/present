import type { ListingStatus, PurchaseStatus } from "@/db/schema";
import type { CheckStatus } from "@/domain/listing-terms";
import { listingStatusLabel, purchaseStatusLabel } from "@/domain/status";

export const kr = (n: number) => `${n.toLocaleString("sv-SE")} kr`;

const pillClass: Record<ListingStatus | PurchaseStatus, string> = {
  active: "ok",
  reserved: "warn",
  sold: "brand",
  flagged: "bad",
  expired: "",
  withdrawn: "",
  started: "warn",
  authorized: "warn",
  delivered: "ok",
  completed: "ok",
  failed: "bad",
  disputed: "warn",
  refunded: "",
};

export function ListingStatusPill({ status }: { status: ListingStatus }) {
  return <span className={`pill ${pillClass[status]}`}>{listingStatusLabel[status]}</span>;
}

export function PurchaseStatusPill({ status }: { status: PurchaseStatus }) {
  return <span className={`pill ${pillClass[status]}`}>{purchaseStatusLabel[status]}</span>;
}

/** The butikskontroll's mark: every annons shown has passed it at publicering. */
export function VerifiedPill() {
  return <span className="pill sim">Kontrollerad (simulerat)</span>;
}

/** Kontrollstatus as a köpare sees it, from the domain's listing terms. */
export function CheckStatusPill({ status }: { status: CheckStatus }) {
  return status === "verified" ? <VerifiedPill /> : <span className="pill bad">Flaggad av butikskontrollen</span>;
}

/** The short-giltighet warning: less than 7 days left of giltighetsdatum. */
export function ShortValidityPill() {
  return <span className="pill warn">Mindre än 7 dagar kvar</span>;
}

export function MerchantLogo({ id }: { id: string }) {
  return (
    <div className="logo" aria-hidden="true">
      {id}
    </div>
  );
}

/** A simulated element: dashed lilac box with its visible label. */
export function SimBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="simbox">
      <span className="lbl">{label}</span>
      {children}
    </div>
  );
}
