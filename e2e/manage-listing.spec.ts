import { eq } from "drizzle-orm";
import { type Browser, type Page, expect, test } from "@playwright/test";
import { closeDb, openDb } from "../src/db/client";
import { listings } from "../src/db/schema";

// Run-unique suffix: every spec run publishes codes no earlier run used.
const run = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const phones = { sara: "0701234567", kalle: "0707654321" } as const;

function aYearAhead(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `horizontal scroll on ${page.url()}`).toBeLessThanOrEqual(clientWidth);
}

async function newUserPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  return context.newPage();
}

async function logIn(page: Page, phone: string) {
  await page.goto("/logga-in");
  await page.getByLabel("Mobilnummer").fill(phone);
  await page.getByRole("button", { name: "Begär inloggningskod" }).click();
  const code = (await page.getByTestId("simulated-sms").innerText()).match(/\d{6}/)?.[0];
  expect(code).toBeTruthy();
  await page.getByLabel("Inloggningskod").fill(code!);
  await page.getByRole("button", { name: "Logga in" }).click();
  await page.waitForURL("**/erbjudanden");
}

async function fillPublishForm(page: Page, giftCardCode: string, price: string) {
  await page.goto("/salj");
  await page.getByLabel("Handlare").selectOption({ label: "Nordiska Kompagniet" });
  await page.getByLabel("Presentkortskod").fill(giftCardCode);
  await page.getByLabel("Saldo (kr)").fill("1000");
  await page.getByLabel("Ditt pris (kr)").fill(price);
  await page.getByLabel("Giltigt till och med").fill(aYearAhead());
  await page.getByRole("button", { name: "Kontrollera och publicera" }).click();
}

async function publish(page: Page, giftCardCode: string): Promise<string> {
  await fillPublishForm(page, giftCardCode, "850");
  await page.waitForURL(/\/annons\/\d+$/);
  return new URL(page.url()).pathname;
}

test("seller edits price, sees publish errors and withdraws", async ({ browser }) => {
  const sara = await newUserPage(browser);
  const kalle = await newUserPage(browser);
  await logIn(sara, phones.sara);

  // A pris equal to the saldo is refused at the pris field with the bounds.
  await fillPublishForm(sara, `NK-ERR-${run}`, "1000");
  await expect(sara.locator('[data-field="price"]')).toContainText(/större än 0 kr och lägre än saldot 1\s000 kr/);
  await expect(sara).toHaveURL(/\/salj$/);
  await expectNoHorizontalScroll(sara);

  const listingPath = await publish(sara, `NK-EDIT-${run}`);
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
  const listingPath = await publish(sara, `DELVIS-${run}`);
  const listingId = Number(listingPath.split("/").pop());

  // Fixture: the köp that flags an annons for saldoavvikelse belongs to story S05.
  const db = openDb(process.env.DATABASE_PATH ?? "data/e2e.db");
  try {
    db.update(listings).set({ status: "flagged", flagReason: "saldoavvikelse" }).where(eq(listings.id, listingId)).run();
  } finally {
    closeDb(db);
  }

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
