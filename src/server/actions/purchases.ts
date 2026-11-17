"use server";

import { redirect } from "next/navigation";
import { isDomainError } from "@/domain/errors";
import { approvePayment, claimPurchase, confirmPurchase, declinePayment, startPurchase } from "@/domain/purchases";
import { getCurrentDeps } from "../deps";
import { requireUser } from "../session";
import { type ActionResult, refusal } from "./result";

export async function startPurchaseAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  let purchaseId: number;
  try {
    // A repeat by the same köpare (second tab, double submit) returns the ongoing köp.
    purchaseId = startPurchase(await getCurrentDeps(), user.id, Number(form.get("listingId")));
  } catch (e) {
    return refusal(e);
  }
  redirect(`/kop/${purchaseId}`);
}

/** The "Simulerad betalning" step's answer: acts only for the köp's köpare. */
async function answerPayment(form: FormData, pay: typeof approvePayment): Promise<ActionResult> {
  const user = await requireUser();
  const purchaseId = Number(form.get("purchaseId"));
  try {
    await pay(await getCurrentDeps(), user.id, purchaseId);
  } catch (e) {
    // A repeated answer (double click, second tab, lapsed reservation) just shows the köp's current status.
    if (!(isDomainError(e) && e.code === "wrong_purchase_status")) return refusal(e);
  }
  redirect(`/kop/${purchaseId}`);
}

export async function approvePaymentAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return answerPayment(form, approvePayment);
}

export async function declinePaymentAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return answerPayment(form, declinePayment);
}

/** "Kortet fungerade": a repeat, or a köp the period already completed, just shows its current status. */
export async function confirmPurchaseAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const purchaseId = Number(form.get("purchaseId"));
  try {
    await confirmPurchase(await getCurrentDeps(), user.id, purchaseId);
  } catch (e) {
    return refusal(e);
  }
  redirect(`/kop/${purchaseId}`);
}

/** "Skicka reklamation": refused with a message without a motivering or outside Levererat. */
export async function claimPurchaseAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const purchaseId = Number(form.get("purchaseId"));
  try {
    await claimPurchase(await getCurrentDeps(), user.id, purchaseId, String(form.get("claimReason") ?? ""));
  } catch (e) {
    return refusal(e);
  }
  redirect(`/kop/${purchaseId}`);
}
