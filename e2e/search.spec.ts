import { and, eq } from "drizzle-orm";
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

/** Records the body of every response the page receives, for leak checks. */
function recordResponses(page: Page) {
  const pending: Promise<string>[] = [];
  page.on("response", (r) => pending.push(r.text().catch(() => "")));
  return { bodies: async () => Promise.all(pending.slice()) };
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

/** Inloggning from wherever the page is, through the simulated SMS; lands on sökningen. */
async function completeLogIn(page: Page, phone: string) {
  await page.getByLabel("Mobilnummer").fill(phone);
  await page.getByRole("button", { name: "Begär inloggningskod" }).click();
  await expect(page.getByText("Simulerat SMS", { exact: true })).toBeVisible();
  const code = (await page.getByTestId("simulated-sms").innerText()).match(/\d{6}/)?.[0];
  expect(code).toBeTruthy();
  await page.getByLabel("Inloggningskod").fill(code!);
  await page.getByRole("button", { name: "Logga in" }).click();
  await page.waitForURL(/\/erbjudanden$/);
}

async function logIn(page: Page, phone: string) {
  await page.goto("/logga-in");
  await completeLogIn(page, phone);
}

async function publish(page: Page, merchant: string, code: string, balance: number, price: number) {
  await page.goto("/salj");
  await page.getByLabel("Handlare").selectOption({ label: merchant });
  await page.getByLabel("Presentkortskod").fill(code);
  await page.getByLabel("Saldo (kr)").fill(String(balance));
  await page.getByLabel("Ditt pris (kr)").fill(String(price));
  await page.getByLabel("Giltigt till och med").fill(aYearAhead());
  await page.getByRole("button", { name: "Kontrollera och publicera" }).click();
  await page.waitForURL(/\/annons\/\d+$/);
  return new URL(page.url()).pathname;
}

/**
 * Fixture: takes every Aktiv annons at a handlare out of sökningen, so a scenario's Given ("two NK
 * annonser") holds whatever earlier specs in the same run left Aktiv there.
 */
function withdrawActiveListingsAt(merchantId: string) {
  const db = openDb(process.env.DATABASE_PATH ?? "data/e2e.db");
  try {
    db.update(listings)
      .set({ status: "withdrawn" })
      .where(and(eq(listings.merchantId, merchantId), eq(listings.status, "active")))
      .run();
  } finally {
    closeDb(db);
  }
}

/** The prices of the listed annonser, top to bottom. */
async function listedPrices(page: Page): Promise<number[]> {
  const texts = await page.getByTestId("listing").locator(".price b").allInnerTexts();
  return texts.map((t) => Number(t.replace(/\D/g, "")));
}

test("logged out visitor is sent to login with a hint", async ({ browser }) => {
  const page = await newUserPage(browser);
  const responses = recordResponses(page);

  for (const path of ["/erbjudanden", "/erbjudanden?handlare=NK", "/erbjudanden?handlare=ICA&sortering=pris"]) {
    await page.goto(path);
    await expect(page, `${path} without a session`).toHaveURL(/\/logga-in\?hanvisning=erbjudanden$/);
    await expect(page.getByRole("status")).toHaveText("Logga in för att se erbjudanden");
    await expectNoHorizontalScroll(page);
  }
  // Nothing received before inloggning holds annons data (the seeded ICA and Clas Ohlson annonser are Aktiv).
  for (const body of await responses.bodies()) {
    expect(body).not.toContain('data-testid="listing"');
    expect(body).not.toContain("Clas Ohlson");
    expect(body).not.toContain("Saldo ");
  }

  await completeLogIn(page, phones.kalle);
  await expect(page.getByRole("heading", { name: "Erbjudanden" })).toBeVisible();
});

test("empty selection shows the no-offers state", async ({ browser }) => {
  // Sara's only Filmstaden annons is her own seeded one, so her Filmstaden urval is empty.
  const sara = await newUserPage(browser);
  await logIn(sara, phones.sara);
  await sara.getByRole("link", { name: "Filmstaden", exact: true }).click();
  await sara.waitForURL(/handlare=FS/);
  await expect(sara.getByTestId("listing")).toHaveCount(0);
  await expect(sara.getByTestId("empty-search")).toContainText("Inga erbjudanden för det här urvalet just nu.");
  await expectNoHorizontalScroll(sara);
  await sara.getByRole("link", { name: "Visa alla handlare" }).click();
  await sara.waitForURL(/\/erbjudanden$/);
  await expect(sara.getByRole("link", { name: "Alla", exact: true })).toHaveAttribute("aria-current", "page");

  // An unknown handlare and an unknown sortering are no error (scenario S06).
  await sara.goto("/erbjudanden?handlare=XYZ");
  await expect(sara.getByTestId("empty-search")).toContainText("Inga erbjudanden för det här urvalet just nu.");
  await sara.goto("/erbjudanden?sortering=billigast");
  await expect(sara.getByLabel("Sortera")).toHaveValue("rabatt");
});

test("buyer filters on merchant, sorts and opens a listing", async ({ browser }) => {
  const sara = await newUserPage(browser);
  const kalle = await newUserPage(browser);

  withdrawActiveListingsAt("NK");
  await logIn(sara, phones.sara);
  const nkPath = await publish(sara, "Nordiska Kompagniet", `S04-NK-${run}`, 1000, 850);
  await publish(sara, "Nordiska Kompagniet", `S04-NK2-${run}`, 500, 400);
  await publish(sara, "Åhléns", `S04-AH-${run}`, 300, 240);

  await logIn(kalle, phones.kalle);
  // All handlare: the seeded Åhléns annons has 4 days left and carries the warning.
  await expect(kalle.getByTestId("listing").getByText("Mindre än 7 dagar kvar").first()).toBeVisible();
  await expectNoHorizontalScroll(kalle);

  await kalle.getByRole("link", { name: "Nordiska Kompagniet", exact: true }).click();
  await kalle.waitForURL(/handlare=NK$/);
  const nk = kalle.getByTestId("listing");
  await expect(nk).toHaveCount(2);
  for (const card of await nk.all()) await expect(card).toContainText("Nordiska Kompagniet");
  // Default högst rabatt: 20 % before 15 %, with rabatt in kr and %.
  await expect(nk.nth(0)).toContainText("−100 kr");
  await expect(nk.nth(0)).toContainText("−20 %");
  await expect(nk.nth(1)).toContainText("−150 kr");
  await expect(nk.nth(1)).toContainText("−15 %");
  await expect(nk.nth(1)).toContainText("Kontrollerad (simulerat)");

  await kalle.getByLabel("Sortera").selectOption({ label: "Lägst pris" });
  await kalle.waitForURL(/handlare=NK&sortering=pris$/);
  expect(await listedPrices(kalle)).toEqual([400, 850]);
  await kalle.getByLabel("Sortera").selectOption({ label: "Längst giltighet" });
  await kalle.waitForURL(/handlare=NK&sortering=giltighet$/);
  await expect(kalle.getByTestId("listing")).toHaveCount(2);
  await expectNoHorizontalScroll(kalle);

  await kalle.locator(`a.card[href="${nkPath}"]`).click();
  await kalle.waitForURL(`**${nkPath}`);
  await expect(kalle.locator(".hero")).toContainText("Nordiska Kompagniet");
  const facts = kalle.locator("dl.kv");
  await expect(facts).toContainText("1 000 kr");
  await expect(facts).toContainText("850 kr");
  await expect(facts).toContainText("150 kr (15 %)");
  await expect(facts).toContainText(aYearAhead());
  await expect(facts).toContainText("Kontrollerad (simulerat)");
  await expect(kalle.getByTestId("discount")).toContainText("Du sparar 150 kr (15 %)");
  await expect(kalle.getByRole("button", { name: "Köp för 850 kr" })).toBeVisible();
  await expect(kalle.getByText("Mindre än 7 dagar kvar")).toHaveCount(0);
  await expectNoHorizontalScroll(kalle);

  // The seeded Åhléns annons's view carries the warning too.
  await kalle.goto("/erbjudanden?handlare=AH");
  await kalle.getByTestId("listing").filter({ hasText: "Mindre än 7 dagar kvar" }).first().click();
  await kalle.waitForURL(/\/annons\/\d+$/);
  await expect(kalle.getByText("Mindre än 7 dagar kvar")).toBeVisible();
  await expectNoHorizontalScroll(kalle);
});
