import { type Page, expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, logIn, newUserPage, phones, publish, recordResponses } from "./helpers";

// Run-unique suffix: every spec run publishes codes no earlier run used (see demo-flow.spec.ts).
const run = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/** The seeded demoadministratör (README). */
const ADMIN_PHONE = "0700000000";
const MOTIVATION = "Kassan sa att koden redan är använd";

/** Kalle buys the annons and approves the simulated payment; lands on the Levererat köp page. */
async function buyAndReceive(kalle: Page, listingPath: string, code: string): Promise<string> {
  await kalle.goto(listingPath);
  await kalle.getByRole("button", { name: "Köp för 850 kr" }).click();
  await kalle.waitForURL(/\/kop\/\d+$/);
  await kalle.getByRole("button", { name: "Godkänn 850 kr" }).click();
  await expect(kalle.getByTestId("gift-card-code")).toHaveText(code);
  await expect(kalle.getByTestId("purchase-status")).toHaveText("Levererat");
  return new URL(kalle.url()).pathname;
}

/** The kronor amount shown in Sara's "Simulerad utbetalning" box. */
async function payoutShown(sara: Page): Promise<number> {
  await sara.goto("/mina-kort");
  const box = sara.locator(".simbox", { hasText: "Simulerad utbetalning" });
  await expect(box).toBeVisible();
  const text = await box.getByTestId("payout-balance").innerText();
  return Number(text.match(/([\d\s ]+) kr/)![1].replace(/[\s ]/g, ""));
}

test("buyer confirms and seller sees simulated payout", async ({ browser }) => {
  const code = `NK-OK-${run}`;
  const sara = await newUserPage(browser);
  const kalle = await newUserPage(browser);
  await logIn(sara, phones.sara);
  const before = await payoutShown(sara);
  const listingPath = await publish(sara, "Nordiska Kompagniet", code);

  await logIn(kalle, phones.kalle);
  await buyAndReceive(kalle, listingPath, code);
  await expect(kalle.getByRole("button", { name: "Kortet fungerade" })).toBeVisible();
  await expect(kalle.getByText("Rapportera fel")).toBeVisible();
  await expectNoHorizontalScroll(kalle);

  await kalle.getByRole("button", { name: "Kortet fungerade" }).click();
  await expect(kalle.getByTestId("purchase-status")).toHaveText("Avslutat");
  await expect(kalle.getByTestId("gift-card-code")).toHaveText(code);
  await expect(kalle.getByRole("button", { name: "Kortet fungerade" })).toHaveCount(0);
  await expectNoHorizontalScroll(kalle);

  // Sara: the annons Såld and the utbetalningssaldo credited 850 kr, marked simulated.
  expect(await payoutShown(sara)).toBe(before + 850);
  await expect(sara.locator(`a.card[href="${listingPath}"]`)).toContainText("Såld");
  await expectNoHorizontalScroll(sara);
});

test("claim becomes dispute and admin refunds", async ({ browser }) => {
  const code = `NK-CLAIM-${run}`;
  const sara = await newUserPage(browser);
  const kalle = await newUserPage(browser);
  const admin = await newUserPage(browser);
  await logIn(sara, phones.sara);
  const payoutBefore = await payoutShown(sara);
  const listingPath = await publish(sara, "Nordiska Kompagniet", code);

  await logIn(kalle, phones.kalle);
  const purchasePath = await buyAndReceive(kalle, listingPath, code);

  // A reklamation without a motivering is refused with a message.
  await kalle.getByText("Rapportera fel").click();
  await kalle.getByRole("button", { name: "Skicka reklamation" }).click();
  await expect(kalle.locator(`[role="alert"][data-field="claimReason"]`)).toContainText("Beskriv vad som hände");
  await expect(kalle.getByTestId("purchase-status")).toHaveText("Levererat");

  await kalle.getByLabel("Vad hände?").fill(MOTIVATION);
  await kalle.getByRole("button", { name: "Skicka reklamation" }).click();
  await expect(kalle.getByTestId("purchase-status")).toHaveText("Tvist");
  await expect(kalle.getByTestId("dispute-note")).toContainText("Utbetalningen till säljaren är fryst");
  await expect(kalle.getByTestId("gift-card-code")).toHaveText(code);
  await expectNoHorizontalScroll(kalle);

  // Kalle's navigation has no Tvister; the demoadministratör's does.
  await expect(kalle.getByRole("navigation").getByRole("link", { name: "Tvister" })).toHaveCount(0);
  const adminResponses = recordResponses(admin);
  await logIn(admin, ADMIN_PHONE);
  await admin.getByRole("navigation").getByRole("link", { name: "Tvister" }).click();
  await admin.waitForURL("**/tvister");
  const dispute = admin.getByTestId("dispute").filter({ hasText: MOTIVATION }).filter({ hasText: "Kalle Berg" }).last();
  await expect(dispute).toContainText("Nordiska Kompagniet");
  await expect(dispute).toContainText("850 kr");
  await expect(dispute).toContainText("Sara Lind");
  await expect(dispute).toContainText("köparen reklamerade");
  await expectNoHorizontalScroll(admin);

  await dispute.getByRole("button", { name: "Återbetala köparen" }).click();
  await expect(admin.getByTestId("dispute").filter({ hasText: MOTIVATION })).toHaveCount(0);
  for (const body of await adminResponses.bodies()) expect(body).not.toContain(code);

  // Kalle: Återbetalat, the simulated återbetalning of 850 kr, and no code.
  const kalleAfter = recordResponses(kalle);
  await kalle.goto(purchasePath);
  await expect(kalle.getByTestId("purchase-status")).toHaveText("Återbetalat");
  const refund = kalle.locator(".simbox", { hasText: "Simulerad återbetalning" });
  await expect(refund).toContainText("850 kr");
  await expect(kalle.getByTestId("gift-card-code")).toHaveCount(0);
  await expectNoHorizontalScroll(kalle);
  for (const body of await kalleAfter.bodies()) expect(body).not.toContain(code);

  // Sara is not credited; the annons stays Såld.
  expect(await payoutShown(sara)).toBe(payoutBefore);
  await expect(sara.locator(`a.card[href="${listingPath}"]`)).toContainText("Såld");
});
