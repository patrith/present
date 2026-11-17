import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { listings } from "../src/db/schema";
import { expectNoHorizontalScroll, logIn, newUserPage, phones, publish, withE2eDb } from "./helpers";

// Run-unique suffix: every spec run publishes codes no earlier run used.
const run = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/** Yesterday's date (YYYY-MM-DD) in Swedish time. */
function yesterdayInSweden(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(
    new Date(Date.now() - 86_400_000),
  );
}

test("expired listing leaves search and is explained to the seller", async ({ browser }) => {
  const sara = await newUserPage(browser);
  const kalle = await newUserPage(browser);
  await logIn(sara, phones.sara);
  await logIn(kalle, phones.kalle);

  // Fixture: publicering refuses a passed date, so the Aktiv annons gets yesterday's giltighetsdatum
  // written straight into the demo database.
  const listingPath = await publish(sara, "Nordiska Kompagniet", `NK-EXP-${run}`);
  const listingId = Number(listingPath.split("/").at(-1));
  const validUntil = yesterdayInSweden();
  withE2eDb((db) => db.update(listings).set({ validUntil }).where(eq(listings.id, listingId)).run());

  await kalle.goto("/erbjudanden");
  await expect(kalle.locator(".card").first()).toBeVisible();
  await expect(kalle.locator(`a[href="${listingPath}"]`)).toHaveCount(0);
  await expectNoHorizontalScroll(kalle);

  await sara.goto("/mina-kort");
  const card = sara.getByTestId("my-listings").locator(`a.card[href="${listingPath}"]`);
  await expect(card).toContainText("Utgången");
  await expect(card.getByTestId("expiry-reason")).toContainText(`giltighetsdatumet ${validUntil} har passerat`);
  await expectNoHorizontalScroll(sara);
});
