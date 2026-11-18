import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";
import { listings } from "../src/db/schema";
import { expectNoHorizontalScroll, fillPublishForm, logIn, newUserPage, phones, publish, withE2eDb } from "./helpers";

// Run-unique suffix: every spec run publishes codes no earlier run used. Kept per spec: the specs share
// one worker, so a suffix in ./helpers would repeat across specs that publish the same code prefix.
const run = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

test("seller edits price, sees publish errors and withdraws", async ({ browser }) => {
  const sara = await newUserPage(browser);
  const kalle = await newUserPage(browser);
  await logIn(sara, phones.sara);

  // A pris equal to the saldo is refused at the pris field with the bounds.
  await fillPublishForm(sara, "Nordiska Kompagniet", `NK-ERR-${run}`, 1000, 1000);
  await expect(sara.locator('[data-field="price"]')).toContainText(/större än 0 kr och lägre än saldot 1\s000 kr/);
  await expect(sara).toHaveURL(/\/salj$/);
  await expectNoHorizontalScroll(sara);

  const listingPath = await publish(sara, "Nordiska Kompagniet", `NK-EDIT-${run}`);
  await expectNoHorizontalScroll(sara);
  await sara.getByLabel("Nytt pris (kr)").fill("800");
  await sara.getByRole("button", { name: "Spara pris" }).click();
  await expect(sara.locator(".hero .big")).toHaveText("800 kr");
  await expectNoHorizontalScroll(sara);

  await logIn(kalle, phones.kalle);
  const card = kalle.locator(`a.card[href="${listingPath}"]`);
  await expect(card).toContainText("800 kr");
  await expectNoHorizontalScroll(kalle);

  await sara.getByRole("button", { name: "Återkalla annonsen" }).click();
  await expect(sara.locator(".hero")).toContainText("Återkallad");
  await expect(sara.getByText("kan inte ändras")).toBeVisible();
  await expectNoHorizontalScroll(sara);

  await kalle.reload();
  await expect(kalle.locator(`a.card[href="${listingPath}"]`)).toHaveCount(0);
  await expectNoHorizontalScroll(kalle);
});

test("seller corrects a flagged listing back to active", async ({ browser }) => {
  const sara = await newUserPage(browser);
  const kalle = await newUserPage(browser);
  await logIn(sara, phones.sara);
  const listingPath = await publish(sara, "Nordiska Kompagniet", `DELVIS-${run}`);
  const listingId = Number(listingPath.split("/").pop());

  // Fixture: the köp that flags an annons for saldoavvikelse belongs to story S05.
  withE2eDb((db) =>
    db.update(listings).set({ status: "flagged", flagReason: "saldoavvikelse" }).where(eq(listings.id, listingId)).run(),
  );

  await sara.goto("/mina-kort");
  await sara.locator(`a.card[href="${listingPath}"]`).click();
  await sara.waitForURL(`**${listingPath}`);
  await expect(sara.locator(".hero")).toContainText("Flaggad");
  await expect(sara.getByTestId("flag-reason")).toContainText("saldoavvikelse");
  await expect(sara.getByText("Kontrollerad (simulerat)", { exact: true })).toHaveCount(0);
  await expectNoHorizontalScroll(sara);

  await sara.getByLabel("Rättat saldo (kr)").fill("800");
  await sara.getByLabel("Pris (kr)", { exact: true }).fill("700");
  await sara.getByRole("button", { name: "Kontrollera och publicera igen" }).click();
  await expect(sara.locator(".hero")).toContainText("Aktiv");
  await expect(sara.locator(".hero .big")).toHaveText("700 kr");
  await expect(sara.locator(".hero")).toContainText("800 kr");
  await expect(sara.getByText("Kontrollerad (simulerat)", { exact: true })).toBeVisible();
  await expect(sara.getByTestId("flag-reason")).toHaveCount(0);
  await expectNoHorizontalScroll(sara);

  await logIn(kalle, phones.kalle);
  const card = kalle.locator(`a.card[href="${listingPath}"]`);
  await expect(card).toContainText("700 kr");
  await expect(card).toContainText("800 kr");
  await expectNoHorizontalScroll(kalle);
});
