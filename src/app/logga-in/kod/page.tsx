import Link from "next/link";
import { redirect } from "next/navigation";
import { latestSimulatedSms } from "@/adapters/sms";
import { ActionForm } from "@/components/action-form";
import { AppFrame } from "@/components/app-frame";
import { SimBox } from "@/components/ui";
import { normalizePhone } from "@/domain/auth";
import { logInAction } from "@/server/actions/auth";
import { getDeps } from "@/server/deps";
import { currentUser } from "@/server/session";

export default async function LoginCodePage({ searchParams }: { searchParams: Promise<{ mobil?: string }> }) {
  if (await currentUser()) redirect("/erbjudanden");
  const phone = normalizePhone((await searchParams).mobil ?? "");
  if (!phone) redirect("/logga-in");
  const sms = latestSimulatedSms(getDeps().db, phone);
  return (
    <AppFrame title="Presentkortsmarknaden" backHref="/logga-in">
      <h2>Ange inloggningskoden</h2>
      {sms && (
        <SimBox label="Simulerat SMS">
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Till {phone}</div>
          <div data-testid="simulated-sms">{sms.body}</div>
        </SimBox>
      )}
      <ActionForm action={logInAction}>
        <input type="hidden" name="phone" value={phone} />
        <label className="field">
          Inloggningskod
          <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required />
        </label>
        <button className="btn" type="submit">
          Logga in
        </button>
      </ActionForm>
      <Link className="btn secondary" href="/logga-in">
        Avbryt
      </Link>
    </AppFrame>
  );
}
