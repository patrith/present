import { describe, expect, it } from "vitest";
import { listings } from "@/db/schema";
import { editListing, publishListing, withdrawListing } from "@/domain/listings";
import { forceListingStatus, listingRow, makeTestDeps, publishNk, userId } from "../helpers";

const nk = (giftCardCode: string, merchantId = "NK") => ({
  merchantId,
  giftCardCode,
  balance: 1000,
  price: 850,
  validUntil: "2027-11-17",
});

const DUPLICATE = { code: "duplicate_code", message: expect.stringMatching(/redan förekommit/) };

describe("duplicate check", () => {
  it("a code once listed for a merchant cannot be listed again", async () => {
    const deps = makeTestDeps();
    const sara = userId(deps.db, "Sara");
    const kalle = userId(deps.db, "Kalle");
    const lisa = userId(deps.db, "Lisa");

    const sold = await publishNk(deps, "NK-1111");
    forceListingStatus(deps.db, sold, "sold");
    const withdrawn = await publishNk(deps, "NK-2222");
    withdrawListing(deps, sara, withdrawn);
    const corrected = await publishNk(deps, "NK-3333");
    await editListing(deps, sara, corrected, { giftCardCode: "NK-3334" });
    expect(listingRow(deps.db, corrected)).toMatchObject({ status: "active", giftCardCode: "NK-3334" });

    const count = () => deps.db.select().from(listings).all().length;
    const before = count();
    for (const code of ["NK-1111", "NK-2222", "NK-3333", " NK-3334 "]) {
      await expect(publishListing(deps, kalle, nk(code)), code).rejects.toMatchObject(DUPLICATE);
    }
    expect(count()).toBe(before);

    // Two simultaneous publiceringar of one new code: exactly one creates an annons.
    const results = await Promise.allSettled([
      publishListing(deps, kalle, nk("NK-5555")),
      publishListing(deps, lisa, nk("NK-5555")),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject(DUPLICATE);
    expect(count()).toBe(before + 1);

    // The same code at another handlare is a different card.
    await expect(publishListing(deps, kalle, nk("NK-1111", "ICA"))).resolves.toBeTypeOf("number");
  });

  it("a corrected code may not reuse an earlier listing's code", async () => {
    const deps = makeTestDeps();
    const sara = userId(deps.db, "Sara");
    const earlier = await publishNk(deps, "NK-1111");
    forceListingStatus(deps.db, earlier, "sold");
    const active = await publishNk(deps, "NK-4471");
    const flagged = await publishNk(deps, "NK-4480");
    forceListingStatus(deps.db, flagged, "flagged", { flagReason: "ogiltig kod" });

    await expect(editListing(deps, sara, active, { giftCardCode: "NK-1111" })).rejects.toMatchObject(DUPLICATE);
    await expect(editListing(deps, sara, flagged, { giftCardCode: "NK-4471" })).rejects.toMatchObject(DUPLICATE);
    expect(listingRow(deps.db, active)).toMatchObject({ status: "active", giftCardCode: "NK-4471" });
    expect(listingRow(deps.db, flagged)).toMatchObject({ status: "flagged", giftCardCode: "NK-4480" });
  });
});
