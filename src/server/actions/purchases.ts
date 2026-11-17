"use server";

import { redirect } from "next/navigation";
import { isDomainError } from "@/domain/errors";
import { approvePayment, startPurchase } from "@/domain/purchases";
import { getDeps } from "../deps";
import { requireUser } from "../session";
import { type ActionResult, refusal } from "./result";

export async function startPurchaseAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  let purchaseId: number;
  try {
    purchaseId = startPurchase(getDeps(), user.id, Number(form.get("listingId")));
  } catch (e) {
    return refusal(e);
  }
  redirect(`/kop/${purchaseId}`);
}

/** The "Simulerad betalning" step's approve: acts only for the köp's köpare. */
export async function approvePaymentAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const purchaseId = Number(form.get("purchaseId"));
  try {
    await approvePayment(getDeps(), user.id, purchaseId);
  } catch (e) {
    // A repeated approve (double click, second tab) just shows the köp's current status.
    if (!(isDomainError(e) && e.code === "wrong_purchase_status")) return refusal(e);
  }
  redirect(`/kop/${purchaseId}`);
}
