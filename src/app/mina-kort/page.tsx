import Link from "next/link";
import { AppFrame } from "@/components/app-frame";
import { kr, ListingStatusPill, MerchantLogo, PurchaseStatusPill } from "@/components/ui";
import { getMyCards } from "@/domain/my-cards";
import { getDeps } from "@/server/deps";
import { requireUser } from "@/server/session";

export default async function MyCardsPage() {
  const user = await requireUser();
  const mine = getMyCards(getDeps().db, user.id);
  return (
    <AppFrame title="Mina kort" user={user} tab="mina-kort">
      <div className="section-t">Köpta kort</div>
      <div className="list" data-testid="my-purchases">
        {mine.purchases.map((p) => (
          <Link key={p.id} className="card" href={`/kop/${p.id}`}>
            <MerchantLogo id={p.merchantId} />
            <div>
              <div className="t">{p.merchantName}</div>
              <div className="s">Köpt för {kr(p.amount)}</div>
              {p.giftCardCode && (
                <div className="s" style={{ fontFamily: "var(--mono)", color: "var(--fg)" }}>
                  {p.giftCardCode}
                </div>
              )}
            </div>
            <PurchaseStatusPill status={p.status} />
          </Link>
        ))}
      </div>
      <div className="section-t">Mina annonser</div>
      <div className="list" data-testid="my-listings">
        {mine.listings.map((l) => (
          <Link key={l.id} className="card" href={`/annons/${l.id}`}>
            <MerchantLogo id={l.merchantId} />
            <div>
              <div className="t">{l.merchantName}</div>
              <div className="s">
                {kr(l.price)} för saldo {kr(l.balance)}
              </div>
            </div>
            <ListingStatusPill status={l.status} />
          </Link>
        ))}
      </div>
    </AppFrame>
  );
}
