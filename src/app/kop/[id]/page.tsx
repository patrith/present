import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, FieldError } from "@/components/action-form";
import { AppFrame } from "@/components/app-frame";
import { kr, PurchaseStatusPill, SimBox, StatusHistory } from "@/components/ui";
import { formatStockholmDateTime } from "@/domain/dates";
import { isDomainError } from "@/domain/errors";
import { getPurchasePage, type PurchasePage } from "@/domain/purchases";
import {
  approvePaymentAction,
  claimPurchaseAction,
  confirmPurchaseAction,
  declinePaymentAction,
} from "@/server/actions/purchases";
import { getCurrentDeps } from "@/server/deps";
import { requireUser } from "@/server/session";

async function loadForBuyer(viewerId: number, purchaseId: number): Promise<PurchasePage> {
  const deps = await getCurrentDeps();
  try {
    return getPurchasePage(deps, viewerId, purchaseId);
  } catch (e) {
    // Anyone but the köpare sees no trace of the köp.
    if (isDomainError(e)) notFound();
    throw e;
  }
}

export default async function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const p = await loadForBuyer(user.id, id);

  return (
    <AppFrame title="Köp" user={user} tab="mina-kort" backHref="/mina-kort">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b>
          {p.merchantName} · {kr(p.amount)}
        </b>
        <span data-testid="purchase-status">
          <PurchaseStatusPill status={p.status} />
        </span>
      </div>

      {p.status === "started" && (
        <>
          {p.reservedUntil && (
            <div className="note warn">
              Annonsen är reserverad åt dig till {formatStockholmDateTime(p.reservedUntil)}.
            </div>
          )}
          <dl className="kv">
            <dt>{p.merchantName}, saldo</dt>
            <dd>{kr(p.balance)}</dd>
            <dt>Att betala</dt>
            <dd>
              <b>{kr(p.amount)}</b>
            </dd>
          </dl>
          <SimBox label="Simulerad betalning">
            <div>Ingen riktig betalning sker. Välj vad betalleverantören ska svara.</div>
            <div className="row">
              <ActionForm action={approvePaymentAction} className="row">
                <input type="hidden" name="purchaseId" value={p.id} />
                <button className="btn ok small" type="submit">
                  Godkänn {kr(p.amount)}
                </button>
              </ActionForm>
              <ActionForm action={declinePaymentAction} className="row">
                <input type="hidden" name="purchaseId" value={p.id} />
                <button className="btn danger small" type="submit">
                  Neka betalningen
                </button>
              </ActionForm>
            </div>
          </SimBox>
        </>
      )}

      {p.status === "authorized" && (
        <div className="note warn">Betalningen är auktoriserad. Kortet kontrolleras hos butiken (simulerat).</div>
      )}

      {p.status === "failed" && (
        <>
          {p.failedAtCheck ? (
            <SimBox label="Simulerad butikskontroll">
              <FailureNote reason={p.failureReason} />
            </SimBox>
          ) : (
            <FailureNote reason={p.failureReason} />
          )}
          <Link className="btn secondary" href="/erbjudanden">
            Tillbaka till erbjudanden
          </Link>
        </>
      )}

      {p.giftCardCode && (
        <>
          {p.codeNote && <div className={`note ${p.status === "disputed" ? "warn" : "ok"}`}>{p.codeNote}</div>}
          <div className="code" data-testid="gift-card-code">
            {p.giftCardCode}
          </div>
          <div className="section-t">Kvitto</div>
          <dl className="kv" data-testid="receipt">
            <dt>Handlare</dt>
            <dd>{p.merchantName}</dd>
            <dt>Saldo</dt>
            <dd>{kr(p.balance)}</dd>
            <dt>Belopp</dt>
            <dd>{kr(p.amount)}</dd>
            <dt>Tidpunkt</dt>
            <dd>{p.deliveredAt && formatStockholmDateTime(p.deliveredAt)}</dd>
            <dt>Giltigt t.o.m.</dt>
            <dd>{p.validUntil}</dd>
          </dl>
        </>
      )}

      {p.canSettle && (
        <>
          {p.claimDeadline && (
            <div className="note">
              Fungerar koden inte? Reklamera senast {formatStockholmDateTime(p.claimDeadline)}. Säljaren får betalt
              när du bekräftar eller när tiden har gått ut.
            </div>
          )}
          <ActionForm action={confirmPurchaseAction} className="row">
            <input type="hidden" name="purchaseId" value={p.id} />
            <button className="btn ok small" type="submit">
              Kortet fungerade
            </button>
          </ActionForm>
          <details>
            <summary>Rapportera fel</summary>
            <ActionForm action={claimPurchaseAction}>
              <input type="hidden" name="purchaseId" value={p.id} />
              <label className="field">
                Vad hände?
                <textarea name="claimReason" rows={2} placeholder="Kassan sa att koden redan är använd" />
              </label>
              <FieldError name="claimReason" />
              <button className="btn danger small" type="submit">
                Skicka reklamation
              </button>
            </ActionForm>
          </details>
        </>
      )}

      {p.disputeNote && (
        <div className="note warn" data-testid="dispute-note">
          {p.disputeNote}
        </div>
      )}

      {p.refund && (
        <SimBox label={p.refund.label}>
          <div>Köpet är återbetalat. Koden visas inte längre.</div>
          <dl className="kv" data-testid="refund">
            <dt>Återbetalt</dt>
            <dd>{kr(p.refund.amount)}</dd>
          </dl>
        </SimBox>
      )}

      <StatusHistory rows={p.history} />
    </AppFrame>
  );
}

function FailureNote({ reason }: { reason: string | null }) {
  return (
    <div className="note bad" data-testid="purchase-failure">
      <b>Köpet genomfördes inte.</b> Orsak: {reason}. Inga pengar har dragits och ingen kod har lämnats ut.
    </div>
  );
}
