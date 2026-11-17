import { type Locator, type Page, expect, test } from "@playwright/test";
import {
  expectNoHorizontalScroll,
  fillPublishForm,
  logIn,
  newUserPage,
  phones,
  publish,
  recordResponses,
  shownCode,
  shownPayout,
  startBuying,
} from "./helpers";

// PRD User Flows 1 and 3 and the FR10 walkthrough, through the UI only (story S08).

const run = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/** The simulated element (dashed box) carrying the visible label `label`. */
function simulated(page: Page, label: string): Locator {
  return page.locator(".simbox").filter({ has: page.locator(".lbl", { hasText: label }) });
}

test("every simulated element is labelled", async ({ browser }) => {
  const sara = await newUserPage(browser);
  const kalle = await newUserPage(browser);
  const admin = await newUserPage(browser);

  // Inloggningskod: "Simulerat SMS".
  await sara.goto("/logga-in");
  await sara.getByLabel("Mobilnummer").fill(phones.sara);
  await sara.getByRole("button", { name: "Begär inloggningskod" }).click();
  await expect(simulated(sara, "Simulerat SMS")).toContainText(/\d{6}/);
  await sara.getByLabel("Inloggningskod").fill(await shownCode(sara));
  await sara.getByRole("button", { name: "Logga in" }).click();
  await sara.waitForURL(/\/erbjudanden$/);

  // A publicering the butikskontroll approves: "Kontrollerad (simulerat)".
  const approvedPath = await publish(sara, "Nordiska Kompagniet", `FR10-NK-${run}`);
  await expect(sara.getByText("Kontrollerad (simulerat)", { exact: true })).toBeVisible();

  // One it rejects (OGILTIG): the refusal sits in "Simulerad butikskontroll".
  await fillPublishForm(sara, "Nordiska Kompagniet", `OGILTIG-${run}`);
  await expect(simulated(sara, "Simulerad butikskontroll")).toContainText("godkände inte presentkortskoden");
  await expectNoHorizontalScroll(sara);

  // The payment step: "Simulerad betalning".
  await logIn(kalle, phones.kalle);
  await startBuying(kalle, approvedPath);
  await expect(simulated(kalle, "Simulerad betalning")).toBeVisible();
  await kalle.getByRole("button", { name: "Godkänn 850 kr" }).click();
  await expect(kalle.getByTestId("purchase-status")).toHaveText("Levererat");

  // A köp the butikskontroll fails at köp (DELVIS): "Simulerad butikskontroll" on the köp page.
  const delvisPath = await publish(sara, "Nordiska Kompagniet", `DELVIS-FR10-${run}`);
  await startBuying(kalle, delvisPath);
  await kalle.getByRole("button", { name: "Godkänn 850 kr" }).click();
  await expect(kalle.getByTestId("purchase-status")).toHaveText("Misslyckat");
  await expect(simulated(kalle, "Simulerad butikskontroll")).toContainText("saldoavvikelse");
  await expectNoHorizontalScroll(kalle);

  // An Återbetalat köp: reklamation, then the demoadministratör refunds – "Simulerad återbetalning".
  const motivation = `Koden nekades i kassan ${run}`;
  const claimedPath = await publish(sara, "Nordiska Kompagniet", `FR10-CLAIM-${run}`);
  const refundedPurchase = await startBuying(kalle, claimedPath);
  await kalle.getByRole("button", { name: "Godkänn 850 kr" }).click();
  await expect(kalle.getByTestId("purchase-status")).toHaveText("Levererat");
  await kalle.getByText("Rapportera fel").click();
  await kalle.getByLabel("Vad hände?").fill(motivation);
  await kalle.getByRole("button", { name: "Skicka reklamation" }).click();
  await expect(kalle.getByTestId("purchase-status")).toHaveText("Tvist");
  await logIn(admin, phones.admin);
  await admin.goto("/tvister");
  await admin.getByTestId("dispute").filter({ hasText: motivation }).getByRole("button", { name: "Återbetala köparen" }).click();
  await expect(admin.getByTestId("dispute").filter({ hasText: motivation })).toHaveCount(0);
  await kalle.goto(refundedPurchase);
  await expect(kalle.getByTestId("purchase-status")).toHaveText("Återbetalat");
  await expect(simulated(kalle, "Simulerad återbetalning")).toBeVisible();

  // The säljare's utbetalningssaldo: "Simulerad utbetalning".
  await sara.goto("/mina-kort");
  await expect(simulated(sara, "Simulerad utbetalning")).toContainText("kr");

  // The demo panel: "Simulerad tid".
  await expect(simulated(sara, "Simulerad tid")).toContainText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
  await expectNoHorizontalScroll(sara);
});

test("demo flow end to end within two minutes", async ({ browser }) => {
  const code = `NK-FLOW-${run}`;
  const sara = await newUserPage(browser);
  const kalle = await newUserPage(browser);
  const started = Date.now();

  // Sara logs in and publishes NK: saldo 1 000 kr for 850 kr; the butikskontroll approves.
  await logIn(sara, phones.sara);
  const payoutBefore = await shownPayout(sara);
  const listingPath = await publish(sara, "Nordiska Kompagniet", code);
  await expect(sara.getByText("Kontrollerad (simulerat)", { exact: true })).toBeVisible();

  // Kalle logs in, filters on NK and opens the annons: 15 % rabatt.
  await logIn(kalle, phones.kalle);
  await kalle.getByRole("link", { name: "Nordiska Kompagniet", exact: true }).click();
  await kalle.waitForURL(/handlare=NK$/);
  await kalle.locator(`a.card[href="${listingPath}"]`).click();
  await kalle.waitForURL(`**${listingPath}`);
  await expect(kalle.getByTestId("discount")).toContainText("(15 %)");
  await expectNoHorizontalScroll(kalle);

  // Buys, approves, sees the code and Levererat, confirms "Kortet fungerade".
  await kalle.getByRole("button", { name: "Köp för 850 kr" }).click();
  await kalle.waitForURL(/\/kop\/\d+$/);
  const purchasePath = new URL(kalle.url()).pathname;
  await kalle.getByRole("button", { name: "Godkänn 850 kr" }).click();
  await expect(kalle.getByTestId("gift-card-code")).toHaveText(code);
  await expect(kalle.getByTestId("purchase-status")).toHaveText("Levererat");
  await kalle.getByRole("button", { name: "Kortet fungerade" }).click();
  await expect(kalle.getByTestId("purchase-status")).toHaveText("Avslutat");

  // Sara's mina kort: Såld and the köp's belopp in her utbetalningssaldo (850 kr on a fresh start).
  await sara.goto("/mina-kort");
  await expect(sara.locator(`a.card[href="${listingPath}"]`)).toContainText("Såld");
  expect(await shownPayout(sara)).toBe(payoutBefore + 850);
  await expectNoHorizontalScroll(sara);

  // Kalle's mina kort: the köp Avslutat with the code, and its statushistorik on the köp page.
  await kalle.goto("/mina-kort");
  const card = kalle.locator(`a.card[href="${purchasePath}"]`);
  await expect(card).toContainText("Avslutat");
  await expect(card).toContainText(code);
  await expectNoHorizontalScroll(kalle);
  await card.click();
  await kalle.waitForURL(`**${purchasePath}`);
  const history = kalle.getByTestId("status-history");
  await expect(history.locator("li")).toHaveCount(4);
  await expect(history.locator("li").last()).toContainText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} · Avslutat · köparen bekräftade/);
  await expectNoHorizontalScroll(kalle);

  expect(Date.now() - started).toBeLessThanOrEqual(120_000);
});

test("declined payment flow is visible in my cards", async ({ browser }) => {
  const code = `NK-DECLINE-${run}`;
  const sara = await newUserPage(browser);
  const kalle = await newUserPage(browser);
  await logIn(sara, phones.sara);
  const listingPath = await publish(sara, "Nordiska Kompagniet", code);

  // Kalle buys and chooses "Neka betalningen": Misslyckat, and nothing he receives holds the code.
  const responses = recordResponses(kalle);
  await logIn(kalle, phones.kalle);
  const purchasePath = await startBuying(kalle, listingPath);
  await kalle.getByRole("button", { name: "Neka betalningen" }).click();
  await expect(kalle.getByTestId("purchase-status")).toHaveText("Misslyckat");
  await expect(kalle.getByTestId("gift-card-code")).toHaveCount(0);

  // His mina kort lists the köp Misslyckat with its orsak, and the köp page its statushistorik.
  await kalle.goto("/mina-kort");
  const card = kalle.locator(`a.card[href="${purchasePath}"]`);
  await expect(card).toContainText("Misslyckat");
  await expect(card.getByTestId("purchase-reason")).toContainText("betalningen nekades");
  await expectNoHorizontalScroll(kalle);
  await card.click();
  await kalle.waitForURL(`**${purchasePath}`);
  await expect(kalle.getByTestId("status-history").locator("li").last()).toContainText("Misslyckat · betalningen nekades");
  await expectNoHorizontalScroll(kalle);

  // The annons is back in Kalle's sökning, and Aktiv in Sara's mina kort.
  await kalle.goto("/erbjudanden");
  await expect(kalle.locator(`a.card[href="${listingPath}"]`)).toBeVisible();
  for (const body of await responses.bodies()) expect(body).not.toContain(code);

  await sara.goto("/mina-kort");
  await expect(sara.locator(`a.card[href="${listingPath}"]`)).toContainText("Aktiv");
  await sara.goto(listingPath);
  await expect(sara.getByTestId("status-history").locator("li").last()).toContainText("Aktiv · betalningen nekades");
  await expectNoHorizontalScroll(sara);
});
