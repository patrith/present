import { notFound } from "next/navigation";
import { ActionForm, FieldError } from "@/components/action-form";
import { AppFrame } from "@/components/app-frame";
import { kr, ListingStatusPill, VerifiedPill } from "@/components/ui";
import { giftCardCodeFor } from "@/domain/gift-card-code";
import { getListing, type ListingDto } from "@/domain/listings";
import { listingStatusLabel } from "@/domain/status";
import { editListingAction, withdrawListingAction } from "@/server/actions/listings";
import { startPurchaseAction } from "@/server/actions/purchases";
import { getDeps } from "@/server/deps";
import { requireUser } from "@/server/session";

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  const { db } = getDeps();
  const listing = Number.isInteger(id) ? getListing(db, id) : undefined;
  if (!listing) notFound();
  const own = listing.sellerId === user.id;
  const code = own ? giftCardCodeFor(db, user.id, listing.id) : undefined;
  const flagged = listing.status === "flagged";

  return (
    <AppFrame title="Erbjudande" user={user} tab={own ? "mina-kort" : "erbjudanden"} backHref={own ? "/mina-kort" : "/erbjudanden"}>
      <div className="hero">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <b>{listing.merchantName}</b>
          <ListingStatusPill status={listing.status} />
        </div>
        <div className="big">{kr(listing.price)}</div>
        <div>För ett kort värt {kr(listing.balance)}</div>
      </div>
      <dl className="kv">
        <dt>Saldo enligt säljaren</dt>
        <dd>{kr(listing.balance)}</dd>
        <dt>Pris</dt>
        <dd>{kr(listing.price)}</dd>
        <dt>Giltigt till och med</dt>
        <dd>{listing.validUntil}</dd>
        <dt>Kontroll</dt>
        {/* A flaggningsorsak outlives återkallelse; only a passed rättning clears it. */}
        <dd>{flagged || listing.flagReason ? <span className="pill bad">Ej godkänd</span> : <VerifiedPill />}</dd>
        <dt>Säljare</dt>
        <dd>{listing.sellerFirstName}</dd>
      </dl>
      {own ? (
        <>
          <label className="field">
            Presentkortskod (bara synlig för dig)
            <div className="code" style={{ fontSize: 16 }} data-testid="gift-card-code">
              {code}
            </div>
          </label>
          <SellerActions listing={listing} code={code ?? ""} />
        </>
      ) : (
        <div className="note">
          Koden visas först när köpet är klart. Kortet kontrolleras igen hos butiken innan pengarna dras.
        </div>
      )}
      {!own && listing.status === "active" && (
        <ActionForm action={startPurchaseAction}>
          <input type="hidden" name="listingId" value={listing.id} />
          <button className="btn" type="submit">
            Köp för {kr(listing.price)}
          </button>
        </ActionForm>
      )}
      {!own && listing.status !== "active" && <div className="note warn">Annonsen kan inte köpas just nu.</div>}
    </AppFrame>
  );
}

/** The säljare's pris change, rättning and återkallelse, offered only in the statuses that allow them. */
function SellerActions({ listing, code }: { listing: ListingDto; code: string }) {
  // Remount the forms when the annons changes, so their fields show the saved values.
  const version = `${listing.status}-${listing.price}-${listing.balance}-${code}`;
  const hidden = <input type="hidden" name="listingId" value={listing.id} />;
  const withdraw = (
    <ActionForm action={withdrawListingAction}>
      {hidden}
      <button className="btn secondary" type="submit">
        Återkalla annonsen
      </button>
    </ActionForm>
  );
  const correction = (submitLabel: string, balanceLabel: string) => (
    <ActionForm action={editListingAction} key={`fix-${version}`}>
      {hidden}
      <label className="field">
        Presentkortskod
        <input name="giftCardCode" defaultValue={code} autoComplete="off" required />
      </label>
      <FieldError name="giftCardCode" />
      <div className="pair">
        <label className="field">
          {balanceLabel}
          <input name="balance" type="number" min={1} step={1} inputMode="numeric" defaultValue={listing.balance} required />
        </label>
        <label className="field">
          Pris (kr)
          <input name="price" type="number" min={1} step={1} inputMode="numeric" defaultValue={listing.price} required />
        </label>
      </div>
      <FieldError name="balance" />
      <FieldError name="price" />
      <div className="note">Kortet kontrolleras hos butiken igen (simulerat) innan ändringen sparas.</div>
      <button className="btn" type="submit">
        {submitLabel}
      </button>
    </ActionForm>
  );

  return (
    <section className="stack" aria-label="Din annons">
      <div className="section-t">Din annons</div>
      {listing.status === "active" && (
        <>
          <ActionForm action={editListingAction} key={`price-${version}`}>
            {hidden}
            <label className="field">
              Nytt pris (kr)
              <input name="price" type="number" min={1} step={1} inputMode="numeric" defaultValue={listing.price} required />
            </label>
            <FieldError name="price" />
            <button className="btn" type="submit">
              Spara pris
            </button>
          </ActionForm>
          <details>
            <summary>Ändra kod eller saldo</summary>
            {correction("Kontrollera och spara", "Saldo (kr)")}
          </details>
          {withdraw}
        </>
      )}
      {listing.status === "flagged" && (
        <>
          <div className="note bad" data-testid="flag-reason">
            Flaggad: {listing.flagReason ?? "butikskontrollen godkände inte kortet"}. Annonsen syns inte i sökningen
            tills du rättar presentkortskoden eller saldot.
          </div>
          {correction("Kontrollera och publicera igen", "Rättat saldo (kr)")}
          {withdraw}
        </>
      )}
      {listing.status !== "active" && listing.status !== "flagged" && (
        <div className="note">
          Annonsen har status {listingStatusLabel[listing.status]} och kan inte ändras.
        </div>
      )}
    </section>
  );
}
