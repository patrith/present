import Link from "next/link";
import { AppFrame } from "@/components/app-frame";
import { CheckStatusPill, kr, MerchantLogo, ShortValidityPill } from "@/components/ui";
import { listMerchants, searchListings } from "@/domain/listings";
import { getCurrentDeps } from "@/server/deps";
import { requireUser } from "@/server/session";
import { parseSearchParams, type SearchParams, searchHref, sortOptions } from "./search-params";
import { SortSelect } from "./sort-select";

export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser({ hint: "erbjudanden" });
  const deps = await getCurrentDeps();
  const merchants = listMerchants(deps.db);
  const selection = parseSearchParams(
    await searchParams,
    merchants.map((m) => m.id),
  );
  const offers = selection.unknownMerchant
    ? []
    : searchListings(deps, user.id, { merchantId: selection.merchantId, sort: selection.sort });
  const sortValue = sortOptions.find((o) => o.sort === selection.sort)!.value;

  return (
    <AppFrame title="Erbjudanden" user={user} tab="erbjudanden">
      <nav className="chips" aria-label="Filtrera på handlare">
        {[{ id: undefined, name: "Alla" }, ...merchants].map((m) => (
          <Link
            key={m.id ?? ""}
            className="chip"
            href={searchHref(m.id, selection.sort)}
            aria-current={m.id === selection.merchantId ? "page" : undefined}
          >
            {m.name}
          </Link>
        ))}
      </nav>
      <form className="sortbar" method="get" action="/erbjudanden">
        {selection.merchantId && <input type="hidden" name="handlare" value={selection.merchantId} />}
        <label className="field">
          Sortera
          {/* Keyed so a back/forward navigation resets the uncontrolled select to the URL's sortering. */}
          <SortSelect key={sortValue} defaultValue={sortValue} options={sortOptions} />
        </label>
        <noscript>
          <button className="btn small secondary" type="submit">
            Sortera
          </button>
        </noscript>
      </form>
      {offers.length > 0 ? (
        <div className="list">
          {offers.map((l) => (
            <Link key={l.id} className="card" href={`/annons/${l.id}`} data-testid="listing">
              <MerchantLogo id={l.merchantId} />
              <div>
                <div className="t">{l.merchantName}</div>
                <div className="s">
                  Saldo {kr(l.balance)} · t.o.m. {l.validUntil}
                </div>
                <div className="row" style={{ marginTop: 4 }}>
                  <CheckStatusPill status={l.checkStatus} />
                  {l.shortValidity && <ShortValidityPill />}
                </div>
              </div>
              <div className="price">
                <b>{kr(l.price)}</b>
                <span className="disc">−{kr(l.discountKr)}</span>
                <span className="disc">−{l.discountPct} %</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty" data-testid="empty-search">
          <div>Inga erbjudanden för det här urvalet just nu.</div>
          {selection.merchantId && (
            <Link className="btn secondary small" href={searchHref(undefined, selection.sort)}>
              Visa alla handlare
            </Link>
          )}
        </div>
      )}
    </AppFrame>
  );
}
