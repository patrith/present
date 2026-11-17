import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { AppFrame } from "@/components/app-frame";
import { requestLoginCodeAction } from "@/server/actions/auth";
import { currentUser } from "@/server/session";

export default async function LoginPage() {
  if (await currentUser()) redirect("/erbjudanden");
  return (
    <AppFrame title="Presentkortsmarknaden">
      <h2>Logga in</h2>
      <p style={{ margin: 0, color: "var(--muted)" }}>Köp presentkort med rabatt, eller sälj kort du inte använder.</p>
      <ActionForm action={requestLoginCodeAction}>
        <label className="field">
          Mobilnummer
          <input name="phone" inputMode="tel" autoComplete="tel" placeholder="070 000 00 00" required />
        </label>
        <button className="btn" type="submit">
          Begär inloggningskod
        </button>
      </ActionForm>
    </AppFrame>
  );
}
