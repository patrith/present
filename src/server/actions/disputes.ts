"use server";

import { redirect } from "next/navigation";
import { decideDispute } from "@/domain/purchases";
import { getCurrentDeps } from "../deps";
import { requireUser } from "../session";
import { type ActionResult, refusal } from "./result";

/** The demoadministratör's "Återbetala köparen" or "Avslå" on a tvist. */
export async function decideDisputeAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const decision = form.get("decision");
  if (decision !== "refund" && decision !== "reject") return { error: "Okänt beslut." };
  try {
    await decideDispute(await getCurrentDeps(), user.id, Number(form.get("purchaseId")), decision);
  } catch (e) {
    return refusal(e);
  }
  redirect("/tvister");
}
