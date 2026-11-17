"use server";

import { redirect } from "next/navigation";
import { publishListing } from "@/domain/listings";
import { getDeps } from "../deps";
import { requireUser } from "../session";
import { type ActionResult, refusal } from "./result";

export async function publishListingAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  let listingId: number;
  try {
    listingId = await publishListing(getDeps(), user.id, {
      merchantId: String(form.get("merchantId") ?? ""),
      giftCardCode: String(form.get("giftCardCode") ?? ""),
      balance: Number(form.get("balance")),
      price: Number(form.get("price")),
      validUntil: String(form.get("validUntil") ?? ""),
    });
  } catch (e) {
    return refusal(e);
  }
  redirect(`/annons/${listingId}`);
}
