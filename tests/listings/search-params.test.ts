import { describe, expect, it } from "vitest";
import { parseSearchParams, searchHref } from "@/app/erbjudanden/search-params";

const merchants = ["NK", "AH", "FS", "CO", "ICA"];

describe("search URL parameters", () => {
  it("unknown merchant gives empty result and unknown sort falls back to discount", () => {
    expect(parseSearchParams({}, merchants)).toEqual({ merchantId: undefined, unknownMerchant: false, sort: "discount" });
    expect(parseSearchParams({ handlare: "NK", sortering: "pris" }, merchants)).toEqual({
      merchantId: "NK",
      unknownMerchant: false,
      sort: "price",
    });
    expect(parseSearchParams({ sortering: "giltighet" }, merchants).sort).toBe("validity");

    expect(parseSearchParams({ handlare: "XYZ" }, merchants)).toMatchObject({ merchantId: "XYZ", unknownMerchant: true });
    expect(parseSearchParams({ sortering: "billigast" }, merchants).sort).toBe("discount");
    expect(parseSearchParams({ handlare: ["NK", "AH"], sortering: ["", "pris"] }, merchants)).toMatchObject({
      merchantId: "NK",
      sort: "discount",
    });

    expect(searchHref(undefined, "discount")).toBe("/erbjudanden");
    expect(searchHref("NK", "validity")).toBe("/erbjudanden?handlare=NK&sortering=giltighet");
  });
});
