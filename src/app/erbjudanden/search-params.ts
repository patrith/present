import type { SearchSort } from "@/domain/listings";

/** Sökningen's URL values for each sortering, with the label the select shows. */
export const sortOptions: { value: string; sort: SearchSort; label: string }[] = [
  { value: "rabatt", sort: "discount", label: "Högst rabatt" },
  { value: "pris", sort: "price", label: "Lägst pris" },
  { value: "giltighet", sort: "validity", label: "Längst giltighet" },
];

export type SearchParams = { handlare?: string | string[]; sortering?: string | string[] };

export type SearchSelection = {
  /** The chosen handlare's id; undefined means "Alla". */
  merchantId?: string;
  /** True when the URL names a handlare that is not in the list: the urval is empty. */
  unknownMerchant: boolean;
  sort: SearchSort;
};

const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/**
 * Reads handlare and sortering from sökningen's URL. An unknown handlare gives an empty urval and an
 * unknown sortering falls back to högst rabatt; neither is an error.
 */
export function parseSearchParams(params: SearchParams, merchantIds: readonly string[]): SearchSelection {
  const merchantId = single(params.handlare);
  const sortValue = single(params.sortering);
  return {
    merchantId,
    unknownMerchant: merchantId !== undefined && !merchantIds.includes(merchantId),
    sort: sortOptions.find((o) => o.value === sortValue)?.sort ?? "discount",
  };
}

/** Sökningen's URL for a handlare and sortering; the defaults stay out of it. */
export function searchHref(merchantId: string | undefined, sort: SearchSort): string {
  const query = new URLSearchParams();
  if (merchantId) query.set("handlare", merchantId);
  const sortValue = sortOptions.find((o) => o.sort === sort)!.value;
  if (sort !== "discount") query.set("sortering", sortValue);
  const qs = query.toString();
  return qs ? `/erbjudanden?${qs}` : "/erbjudanden";
}
