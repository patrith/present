import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { simulatedSmsById } from "@/adapters/sms";
import { ActionForm } from "@/components/action-form";
import { AppFrame } from "@/components/app-frame";
import { SimBox } from "@/components/ui";
import { logInAction, requestLoginCodeAction } from "@/server/actions/auth";
import { getDeps } from "@/server/deps";
import { LOGIN_SMS_COOKIE, currentUser } from "@/server/session";
import { mobileParam } from "../mobile-param";

export default async function LoginCodePage({ searchParams }: { searchParams: Promise<{ mobil?: string }> }) {
  if (await currentUser()) redirect("/erbjudanden");
  const phone = mobileParam((await searchParams).mobil);
  if (!phone) redirect("/logga-in");
  // Only the SMS this browser requested for this number, never any number's latest.
  const smsId = Number((await cookies()).get(LOGIN_SMS_COOKIE)?.value);
  const requested = Number.isInteger(smsId) ? simulatedSmsById(getDeps().db, smsId) : undefined;
  const sms = requested?.phone === phone ? requested : undefined;
  return (
    <AppFrame title="Presentkortsmarknaden" backHref="/logga-in">
      <h2>Ange inloggningskoden</h2>
      {sms && (
        <SimBox label="Simulerat SMS">
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Till {phone}</div>
          <div data-testid="simulated-sms">{sms.body}</div>
        </SimBox>
      )}
      {/* A new inloggningskod remounts the form, clearing the old one's felmeddelande. */}
      <ActionForm key={sms?.id} action={logInAction}>
        <input type="hidden" name="phone" value={phone} />
        <label className="field">
          Inloggningskod
          <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required />
        </label>
        <button className="btn" type="submit">
          Logga in
        </button>
      </ActionForm>
      <ActionForm action={requestLoginCodeAction}>
        <input type="hidden" name="phone" value={phone} />
        <button className="btn secondary" type="submit">
          Begär ny inloggningskod
        </button>
      </ActionForm>
      <Link className="btn secondary" href="/logga-in">
        Avbryt
      </Link>
    </AppFrame>
  );
}
