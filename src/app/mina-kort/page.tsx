import Link from "next/link";
import { AppFrame } from "@/components/app-frame";
import { kr, ListingStatusPill, MerchantLogo, PurchaseStatusPill, SimBox } from "@/components/ui";
import { getMyCards, MY_CARDS_EMPTY } from "@/domain/my-cards";
import { getCurrentDeps } from "@/server/deps";
import { requireUser } from "@/server/session";

function Empty({ state, testId }: { state: { text: string; linkText: string; href: string }; testId: string }) {
  return (
    <div className="empty" data-testid={testId}>
      {state.text}{" "}
      <Link href={state.href}>{state.linkText}</Link>
    </div>
  );
}

export default async function MyCardsPage() {
  const user = await requireUser();
  const mine = getMyCards((await getCurrentDeps()).db, user.id);
  return (
    <AppFrame title="Mina kort" user={user} tab="mina-kort">
      <SimBox label="Simulerad utbetalning">
        <div className="row" style={{ justifyContent: "space-between" }} data-testid="payout-balance">
          <span>Ditt utbetalningssaldo från sålda kort</span>
          <b style={{ fontSize: 20 }}>{kr(mine.payoutBalance)}</b>
        </div>
      </SimBox>
      <div className="section-t">Köpta kort</div>
      {mine.purchases.length === 0 && <Empty state={MY_CARDS_EMPTY.purchases} testId="no-purchases" />}
      <div className="list" data-testid="my-purchases">
        {mine.purchases.map((p) => (
          <Link key={p.id} className="card" href={`/kop/${p.id}`} data-testid="my-purchase">
            <MerchantLogo id={p.merchantId} />
            <div>
              <div className="t">{p.merchantName}</div>
              <div className="s">Köpt för {kr(p.amount)}</div>
              {p.giftCardCode && (
                <div className="s" style={{ fontFamily: "var(--mono)", color: "var(--fg)" }}>
                  {p.giftCardCode}
                </div>
              )}
              {p.status === "failed" && (
                <div className="s" data-testid="purchase-reason">
                  {p.failedAtCheck && <span className="pill sim">Simulerad butikskontroll</span>} Orsak:{" "}
                  {p.failureReason}
                </div>
              )}
              {(p.status === "started" || p.status === "authorized") && (
                <div className="s" data-testid="purchase-next">
                  {p.status === "started" ? "Gå vidare till betalningen →" : "Betalningen behandlas →"}
                </div>
              )}
            </div>
            <PurchaseStatusPill status={p.status} />
          </Link>
        ))}
      </div>
      <div className="section-t">Mina annonser</div>
      {mine.listings.length === 0 && <Empty state={MY_CARDS_EMPTY.listings} testId="no-listings" />}
      <div className="list" data-testid="my-listings">
        {mine.listings.map((l) => (
          <Link key={l.id} className="card" href={`/annons/${l.id}`} data-testid="my-listing">
            <MerchantLogo id={l.merchantId} />
            <div>
              <div className="t">{l.merchantName}</div>
              <div className="s">
                {kr(l.price)} för saldo {kr(l.balance)}
              </div>
              {l.status === "flagged" && l.flagReason && (
                <div className="s" data-testid="flag-reason">
                  Flaggad: {l.flagReason}
                </div>
              )}
              {l.expiryReason && (
                <div className="s" data-testid="expiry-reason">
                  Har gått ut: {l.expiryReason}
                </div>
              )}
            </div>
            <ListingStatusPill status={l.status} />
          </Link>
        ))}
      </div>
    </AppFrame>
  );
}
