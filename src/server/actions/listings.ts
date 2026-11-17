"use server";

import { redirect } from "next/navigation";
import { editListing, type ListingChanges, publishListing, withdrawListing } from "@/domain/listings";
import { getDeps } from "../deps";
import { requireUser } from "../session";
import { type ActionResult, formNumber, refusal } from "./result";

export async function publishListingAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  let listingId: number;
  try {
    listingId = await publishListing(getDeps(), user.id, {
      merchantId: String(form.get("merchantId") ?? ""),
      giftCardCode: String(form.get("giftCardCode") ?? ""),
      balance: formNumber(form, "balance"),
      price: formNumber(form, "price"),
      validUntil: String(form.get("validUntil") ?? ""),
    });
  } catch (e) {
    return refusal(e);
  }
  redirect(`/annons/${listingId}`);
}

/** The säljare's change of pris, and of presentkortskod or saldo when the form carries them. */
export async function editListingAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const listingId = Number(form.get("listingId"));
  const changes: ListingChanges = { price: formNumber(form, "price") };
  if (form.has("giftCardCode")) changes.giftCardCode = String(form.get("giftCardCode"));
  if (form.has("balance")) changes.balance = formNumber(form, "balance");
  try {
    await editListing(getDeps(), user.id, listingId, changes);
  } catch (e) {
    return refusal(e);
  }
  redirect(`/annons/${listingId}`);
}

export async function withdrawListingAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const listingId = Number(form.get("listingId"));
  try {
    withdrawListing(getDeps(), user.id, listingId);
  } catch (e) {
    return refusal(e);
  }
  redirect(`/annons/${listingId}`);
}
