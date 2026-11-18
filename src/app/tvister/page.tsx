import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { AppFrame } from "@/components/app-frame";
import { kr, PurchaseStatusPill } from "@/components/ui";
import { formatStockholmDateTime } from "@/domain/dates";
import { getDisputesPage } from "@/domain/disputes";
import { isDomainError } from "@/domain/errors";
import { decideDisputeAction } from "@/server/actions/disputes";
import { getCurrentDeps } from "@/server/deps";
import { requireUser } from "@/server/session";

/** Tvister: the demoadministratör's view of every open tvist, built from a code-free DTO. */
export default async function DisputesPage() {
  const user = await requireUser();
  let page: ReturnType<typeof getDisputesPage>;
  try {
    page = getDisputesPage((await getCurrentDeps()).db, user.id);
  } catch (e) {
    // Anyone but the demoadministratör sees no trace of Tvister.
    if (isDomainError(e)) notFound();
    throw e;
  }

  return (
    <AppFrame title="Tvister" user={user} tab="tvister">
      {page.emptyText && <div className="empty">{page.emptyText}</div>}
      {page.disputes.map((d) => (
        <section key={d.purchaseId} className="stack dispute" data-testid="dispute">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <b>
              {d.merchantName} · {kr(d.amount)}
            </b>
            <PurchaseStatusPill status="disputed" />
          </div>
          <div className="s">
            Köpare {d.buyerName} · säljare {d.sellerName}
          </div>
          <div className="note" data-testid="dispute-claim">
            ”{d.claimReason}”
          </div>
          <div className="section-t">Historik</div>
          <ol className="history">
            {d.history.map((h, i) => (
              <li key={i}>
                <span>{formatStockholmDateTime(h.at)}</span> · <b>{h.status}</b> · {h.actor} · {h.reason}
              </li>
            ))}
          </ol>
          <div className="row">
            <ActionForm action={decideDisputeAction} className="row">
              <input type="hidden" name="purchaseId" value={d.purchaseId} />
              <input type="hidden" name="decision" value="refund" />
              <button className="btn small" type="submit">
                Återbetala köparen
              </button>
            </ActionForm>
            <ActionForm action={decideDisputeAction} className="row">
              <input type="hidden" name="purchaseId" value={d.purchaseId} />
              <input type="hidden" name="decision" value="reject" />
              <button className="btn secondary small" type="submit">
                Avslå
              </button>
            </ActionForm>
          </div>
        </section>
      ))}
    </AppFrame>
  );
}
