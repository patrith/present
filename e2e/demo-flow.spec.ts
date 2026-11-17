import fs from "node:fs";
import { type Browser, type Page, expect, test } from "@playwright/test";

// Run-unique suffix: every spec run publishes codes no earlier run used.
const run = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const phones = { sara: "0701234567", kalle: "0707654321", lisa: "0731112233" } as const;
const SEEDED_MERCHANTS = ["Clas Ohlson", "Filmstaden", "ICA", "Nordiska Kompagniet", "Åhléns"];

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

async function logIn(page: Page, phone: string) {
  await page.goto("/logga-in");
  await expectNoHorizontalScroll(page);
  await page.getByLabel("Mobilnummer").fill(phone);
  await page.getByRole("button", { name: "Begär inloggningskod" }).click();
  await expect(page.getByText("Simulerat SMS")).toBeVisible();
  await expectNoHorizontalScroll(page);
  const sms = await page.getByTestId("simulated-sms").innerText();
  const code = sms.match(/\d{6}/)?.[0];
  expect(code).toBeTruthy();
  await page.getByLabel("Inloggningskod").fill(code!);
  await page.getByRole("button", { name: "Logga in" }).click();
  await page.waitForURL("**/erbjudanden");
}

async function publish(page: Page, merchant: string, giftCardCode: string): Promise<string> {
  await page.getByRole("link", { name: "Sälj" }).click();
  await page.waitForURL("**/salj");
  await expectNoHorizontalScroll(page);
  await page.getByLabel("Handlare").selectOption({ label: merchant });
  await page.getByLabel("Presentkortskod").fill(giftCardCode);
  await page.getByLabel("Saldo (kr)").fill("1000");
  await page.getByLabel("Ditt pris (kr)").fill("850");
  await page.getByLabel("Giltigt till och med").fill(aYearAhead());
  await page.getByRole("button", { name: "Kontrollera och publicera" }).click();
  await page.waitForURL(/\/annons\/\d+$/);
  await expectNoHorizontalScroll(page);
  return new URL(page.url()).pathname;
}

test("demo flow publish find buy see code", async ({ browser }) => {
  const code = `NK-${run}`;
  const sara = await newUserPage(browser);
  const kalle = await newUserPage(browser);
  const lisa = await newUserPage(browser);

  // Sara publishes an NK card: saldo 1 000 kr, pris 850 kr, valid a year ahead.
  await logIn(sara, phones.sara);
  const listingPath = await publish(sara, "Nordiska Kompagniet", code);
  await expect(sara.getByText("Aktiv")).toBeVisible();
  await expect(sara.getByText("Kontrollerad (simulerat)")).toBeVisible();
  await expect(sara.getByTestId("gift-card-code")).toHaveText(code);

  // Kalle finds it in sökningen and buys it; nothing he receives before leverans holds the code.
  const kalleBeforeDelivery = recordResponses(kalle);
  await logIn(kalle, phones.kalle);
  await expectNoHorizontalScroll(kalle);
  const listing = kalle.locator(`a.card[href="${listingPath}"]`);
  await expect(listing).toContainText("Nordiska Kompagniet");
  await expect(listing).toContainText("1 000 kr");
  await expect(listing).toContainText("850 kr");
  await expect(listing).toContainText("Kontrollerad (simulerat)");
  await listing.click();
  await kalle.waitForURL(`**${listingPath}`);
  await expectNoHorizontalScroll(kalle);
  await kalle.getByRole("button", { name: "Köp för 850 kr" }).click();
  await kalle.waitForURL(/\/kop\/\d+$/);
  await expect(kalle.getByText("Simulerad betalning")).toBeVisible();
  await expectNoHorizontalScroll(kalle);
  for (const body of await kalleBeforeDelivery.bodies()) expect(body).not.toContain(code);

  await kalle.getByRole("button", { name: "Godkänn 850 kr" }).click();
  await expect(kalle.getByTestId("gift-card-code")).toHaveText(code);
  await expect(kalle.getByTestId("purchase-status")).toHaveText("Levererat");
  const receipt = kalle.getByTestId("receipt");
  await expect(receipt).toContainText("Belopp");
  await expect(receipt).toContainText("850 kr");
  await expect(receipt).toContainText(/Tidpunkt\s*\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
  await expectNoHorizontalScroll(kalle);

  // Mina kort: Kalle sees the code and Levererat; Sara sees Såld.
  await kalle.getByRole("link", { name: "Mina kort" }).click();
  await kalle.waitForURL("**/mina-kort");
  await expect(kalle.getByTestId("my-purchases")).toContainText(code);
  await expect(kalle.getByTestId("my-purchases")).toContainText("Levererat");
  await expectNoHorizontalScroll(kalle);

  await sara.getByRole("link", { name: "Mina kort" }).click();
  await sara.waitForURL("**/mina-kort");
  const saraListing = sara.locator(`a.card[href="${listingPath}"]`);
  await expect(saraListing).toContainText("Såld");
  await expect(saraListing).toContainText("850 kr");
  await expect(saraListing).toContainText("1 000 kr");
  await expectNoHorizontalScroll(sara);

  // Lisa sees no trace of the code anywhere.
  const lisaResponses = recordResponses(lisa);
  await logIn(lisa, phones.lisa);
  await lisa.goto(listingPath);
  await expect(lisa.getByText("Såld")).toBeVisible();
  await expectNoHorizontalScroll(lisa);
  await lisa.goto("/mina-kort");
  await expectNoHorizontalScroll(lisa);
  for (const body of await lisaResponses.bodies()) expect(body).not.toContain(code);

  // The server's console output never carries the code.
  expect(fs.readFileSync("e2e/.server.log", "utf8")).not.toContain(code);
});

test("simulated steps are labelled", async ({ browser }) => {
  const sara = await newUserPage(browser);
  const kalle = await newUserPage(browser);

  await sara.goto("/logga-in");
  await sara.getByLabel("Mobilnummer").fill(phones.sara);
  await sara.getByRole("button", { name: "Begär inloggningskod" }).click();
  await expect(sara.getByText("Simulerat SMS", { exact: true })).toBeVisible();
  await logIn(sara, phones.sara);
  const listingPath = await publish(sara, "Nordiska Kompagniet", `NK-LBL-${run}`);
  await expect(sara.getByText("Kontrollerad (simulerat)", { exact: true })).toBeVisible();

  await logIn(kalle, phones.kalle);
  await expect(kalle.locator(`a.card[href="${listingPath}"]`).getByText("Kontrollerad (simulerat)")).toBeVisible();
  await kalle.goto(listingPath);
  await kalle.getByRole("button", { name: "Köp för 850 kr" }).click();
  await kalle.waitForURL(/\/kop\/\d+$/);
  await expect(kalle.getByText("Simulerad betalning", { exact: true })).toBeVisible();
});

test("pages redirect a visitor without a session to inloggning", async ({ page }) => {
  for (const path of ["/", "/erbjudanden", "/salj", "/mina-kort", "/annons/1", "/kop/1"]) {
    await page.goto(path);
    await expect(page, `${path} without a session`).toHaveURL(/\/logga-in$/);
  }
});

test("demo start offers exactly the seeded merchants", async ({ browser }) => {
  const sara = await newUserPage(browser);
  await logIn(sara, phones.sara);
  await sara.goto("/salj");
  const options = await sara.getByLabel("Handlare").locator("option").allInnerTexts();
  expect(options.map((o) => o.trim()).sort()).toEqual([...SEEDED_MERCHANTS].sort());
});
