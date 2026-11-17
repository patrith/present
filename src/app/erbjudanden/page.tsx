import Link from "next/link";
import { AppFrame } from "@/components/app-frame";
import { kr, MerchantLogo, VerifiedPill } from "@/components/ui";
import { searchListings } from "@/domain/listings";
import { getCurrentDeps } from "@/server/deps";
import { requireUser } from "@/server/session";

export default async function SearchPage() {
  const user = await requireUser();
  const activeListings = searchListings((await getCurrentDeps()).db);
  return (
    <AppFrame title="Erbjudanden" user={user} tab="erbjudanden">
      <div className="list">
        {activeListings.map((l) => (
          <Link key={l.id} className="card" href={`/annons/${l.id}`} data-testid="listing">
            <MerchantLogo id={l.merchantId} />
            <div>
              <div className="t">{l.merchantName}</div>
              <div className="s">
                Saldo {kr(l.balance)} · t.o.m. {l.validUntil}
              </div>
              <div className="row" style={{ marginTop: 4 }}>
                <VerifiedPill />
              </div>
            </div>
            <div className="price">
              <b>{kr(l.price)}</b>
            </div>
          </Link>
        ))}
      </div>
    </AppFrame>
  );
}
