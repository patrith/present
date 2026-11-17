import type { ListingStatus, PurchaseStatus } from "@/db/schema";
import type { CheckStatus } from "@/domain/listing-terms";
import { formatStockholmTimestamp } from "@/domain/dates";
import { kronor } from "@/domain/money";
import type { OwnerHistoryRow } from "@/domain/status-history";
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

/** Kontrollstatus from the domain's listing terms: "Ej godkänd" while a flaggningsorsak is set. */
export function CheckStatusPill({ status }: { status: CheckStatus }) {
  return status === "verified" ? <VerifiedPill /> : <span className="pill bad">Ej godkänd</span>;
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

/** An annons's or köp's statushistorik for its owner: tidpunkt (Swedish time), status and orsak, oldest first. */
export function StatusHistory({ rows }: { rows: OwnerHistoryRow[] }) {
  return (
    <section className="stack" aria-label="Statushistorik">
      <div className="section-t">Statushistorik</div>
      <ol className="history" data-testid="status-history">
        {rows.map((h, i) => (
          <li key={i}>
            <span>{formatStockholmTimestamp(h.at)}</span> · <b>{h.status}</b> · {h.reason}
          </li>
        ))}
      </ol>
    </section>
  );
}
