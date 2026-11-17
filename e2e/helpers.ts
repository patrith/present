import { type Browser, type Page, expect } from "@playwright/test";
import { type Db, closeDb, openDb } from "../src/db/client";

// Shared harness for the e2e specs. Not a spec itself: Playwright collects only *.spec.ts.

export const phones = { sara: "0701234567", kalle: "0707654321", lisa: "0731112233" } as const;

export function aYearAhead(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/** Records the body of every response the page receives, for leak checks. */
export function recordResponses(page: Page) {
  const pending: Promise<string>[] = [];
  page.on("response", (r) => pending.push(r.text().catch(() => "")));
  return { bodies: async () => Promise.all(pending.slice()) };
}

export async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `horizontal scroll on ${page.url()}`).toBeLessThanOrEqual(clientWidth);
}

/** A page in its own browser context (its own session), at the narrow width. */
export async function newUserPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  return context.newPage();
}

/** The six-digit inloggningskod the "Simulerat SMS" shows. */
export async function shownCode(page: Page): Promise<string> {
  await expect(page.getByText("Simulerat SMS", { exact: true })).toBeVisible();
  const code = (await page.getByTestId("simulated-sms").innerText()).match(/\d{6}/)?.[0];
  expect(code).toBeTruthy();
  return code!;
}

type LogInOptions = {
  /** Also check for horizontal scroll on the inloggning and code steps. */
  checkLayout?: boolean;
};

/** Inloggning from wherever the page is, through the simulated SMS; lands on sökningen. */
export async function completeLogIn(page: Page, phone: string, { checkLayout = false }: LogInOptions = {}) {
  await page.getByLabel("Mobilnummer").fill(phone);
  await page.getByRole("button", { name: "Begär inloggningskod" }).click();
  const code = await shownCode(page);
  if (checkLayout) await expectNoHorizontalScroll(page);
  await page.getByLabel("Inloggningskod").fill(code);
  await page.getByRole("button", { name: "Logga in" }).click();
  await page.waitForURL(/\/erbjudanden$/);
}

export async function logIn(page: Page, phone: string, options: LogInOptions = {}) {
  await page.goto("/logga-in");
  if (options.checkLayout) await expectNoHorizontalScroll(page);
  await completeLogIn(page, phone, options);
}

/** Fills and submits the sälj form, a year's giltighet; saldo 1 000 kr and pris 850 kr unless given. */
export async function fillPublishForm(page: Page, merchant: string, code: string, balance = 1000, price = 850) {
  await page.goto("/salj");
  await page.getByLabel("Handlare").selectOption({ label: merchant });
  await page.getByLabel("Presentkortskod").fill(code);
  await page.getByLabel("Saldo (kr)").fill(String(balance));
  await page.getByLabel("Ditt pris (kr)").fill(String(price));
  await page.getByLabel("Giltigt till och med").fill(aYearAhead());
  await page.getByRole("button", { name: "Kontrollera och publicera" }).click();
}

/** Publishes a card through the sälj form; returns the annons's path. */
export async function publish(
  page: Page,
  merchant: string,
  code: string,
  balance = 1000,
  price = 850,
): Promise<string> {
  await fillPublishForm(page, merchant, code, balance, price);
  await page.waitForURL(/\/annons\/\d+$/);
  return new URL(page.url()).pathname;
}

/** Runs a fixture write against the e2e app's database. */
export function withE2eDb(write: (db: Db) => void): void {
  const db = openDb(process.env.DATABASE_PATH ?? "data/e2e.db");
  try {
    write(db);
  } finally {
    closeDb(db);
  }
}
