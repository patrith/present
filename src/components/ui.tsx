import type { ListingStatus, PurchaseStatus } from "@/db/schema";
import { kronor } from "@/domain/money";
import { listingStatusLabel, purchaseStatusLabel } from "@/domain/status";

export const kr = kronor;

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
