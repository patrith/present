import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { AppFrame } from "@/components/app-frame";
import { signUpAction } from "@/server/actions/auth";
import { currentUser } from "@/server/session";
import { mobileParam } from "../logga-in/mobile-param";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ mobil?: string; hanvisning?: string }>;
}) {
  if (await currentUser()) redirect("/erbjudanden");
  const params = await searchParams;
  const phone = mobileParam(params.mobil);
  return (
    <AppFrame title="Presentkortsmarknaden" backHref="/logga-in">
      <h2>Skapa konto</h2>
      {phone && params.hanvisning === "inget-konto" && (
        <div className="note warn" role="status">
          Det finns inget konto för {phone}. Skapa ett konto för att logga in.
        </div>
      )}
      <ActionForm action={signUpAction}>
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
        <label className="field">
          Förnamn
          <input name="firstName" autoComplete="given-name" required />
        </label>
        <label className="field">
          Efternamn
          <input name="lastName" autoComplete="family-name" required />
        </label>
        <button className="btn" type="submit">
          Skapa konto
        </button>
      </ActionForm>
      <Link className="btn secondary" href="/logga-in">
        Jag har redan ett konto
      </Link>
    </AppFrame>
  );
}
