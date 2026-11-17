import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { AppFrame } from "@/components/app-frame";
import { CheckStatusPill, kr, ListingStatusPill, ShortValidityPill } from "@/components/ui";
import { giftCardCodeFor } from "@/domain/gift-card-code";
import { getListingView } from "@/domain/listings";
import { startPurchaseAction } from "@/server/actions/purchases";
import { getDeps } from "@/server/deps";
import { requireUser } from "@/server/session";

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  const deps = getDeps();
  const { db } = deps;
  const listing = Number.isInteger(id) ? getListingView(deps, id) : undefined;
  if (!listing) notFound();
  const own = listing.sellerId === user.id;
  const code = own ? giftCardCodeFor(db, user.id, listing.id) : undefined;

  return (
    <AppFrame title="Erbjudande" user={user} tab="erbjudanden" backHref="/erbjudanden">
      <div className="hero">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <b>{listing.merchantName}</b>
          <ListingStatusPill status={listing.status} />
        </div>
        <div className="big">{kr(listing.price)}</div>
        <div data-testid="discount">
          Du sparar {kr(listing.discountKr)} ({listing.discountPct} %) på ett kort värt {kr(listing.balance)}
        </div>
      </div>
      {listing.shortValidity && (
        <div className="row">
          <ShortValidityPill />
        </div>
      )}
      <dl className="kv">
        <dt>Saldo enligt säljaren</dt>
        <dd>{kr(listing.balance)}</dd>
        <dt>Pris</dt>
        <dd>{kr(listing.price)}</dd>
        <dt>Rabatt</dt>
        <dd>
          {kr(listing.discountKr)} ({listing.discountPct} %)
        </dd>
        <dt>Giltigt till och med</dt>
        <dd>{listing.validUntil}</dd>
        <dt>Kontroll</dt>
        <dd>
          <CheckStatusPill status={listing.checkStatus} />
        </dd>
        <dt>Säljare</dt>
        <dd>{listing.sellerFirstName}</dd>
      </dl>
      {own ? (
        <label className="field">
          Presentkortskod (bara synlig för dig)
          <div className="code" style={{ fontSize: 16 }} data-testid="gift-card-code">
            {code}
          </div>
        </label>
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
