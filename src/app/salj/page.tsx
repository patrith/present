import { ActionForm } from "@/components/action-form";
import { AppFrame } from "@/components/app-frame";
import { listMerchants } from "@/domain/listings";
import { publishListingAction } from "@/server/actions/listings";
import { getDeps } from "@/server/deps";
import { requireUser } from "@/server/session";

export default async function SellPage() {
  const user = await requireUser();
  const merchants = listMerchants(getDeps().db);
  return (
    <AppFrame title="Sälj" user={user} tab="salj">
      <h2 style={{ fontSize: 20 }}>Sälj ett presentkort</h2>
      <ActionForm action={publishListingAction}>
        <label className="field">
          Handlare
          <select name="merchantId" required>
            {merchants.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Presentkortskod
          <input name="giftCardCode" placeholder="t.ex. NK-1234-5678" autoComplete="off" required />
        </label>
        <div className="pair">
          <label className="field">
            Saldo (kr)
            <input name="balance" type="number" min={1} step={1} inputMode="numeric" required />
          </label>
          <label className="field">
            Ditt pris (kr)
            <input name="price" type="number" min={1} step={1} inputMode="numeric" required />
          </label>
        </div>
        <label className="field">
          Giltigt till och med
          <input name="validUntil" type="date" required />
        </label>
        <div className="note">
          Kortet kontrolleras hos butiken (simulerat) innan annonsen publiceras. Koden visas bara för köparen efter köpet.
        </div>
        <button className="btn" type="submit">
          Kontrollera och publicera
        </button>
      </ActionForm>
    </AppFrame>
  );
}
