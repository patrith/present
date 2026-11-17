import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { AppFrame } from "@/components/app-frame";
import { requestLoginCodeAction } from "@/server/actions/auth";
import { currentUser } from "@/server/session";
import { mobileParam } from "./mobile-param";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mobil?: string; hanvisning?: string }>;
}) {
  if (await currentUser()) redirect("/erbjudanden");
  const params = await searchParams;
  const phone = mobileParam(params.mobil);
  return (
    <AppFrame title="Presentkortsmarknaden">
      <h2>Logga in</h2>
      <p style={{ margin: 0, color: "var(--muted)" }}>Köp presentkort med rabatt, eller sälj kort du inte använder.</p>
      {phone && params.hanvisning === "konto-finns" && (
        <div className="note warn" role="status">
          Det finns redan ett konto för {phone}. Logga in med mobilnumret.
        </div>
      )}
      <ActionForm action={requestLoginCodeAction}>
        <label className="field">
          Mobilnummer
          <input
            name="phone"
            inputMode="tel"
            autoComplete="tel"
            placeholder="070 000 00 00"
            defaultValue={phone}
            required
          />
        </label>
        <button className="btn" type="submit">
          Begär inloggningskod
        </button>
      </ActionForm>
      <Link className="btn secondary" href="/skapa-konto">
        Skapa konto
      </Link>
    </AppFrame>
  );
}
