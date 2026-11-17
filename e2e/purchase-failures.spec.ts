import { type Page, expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, logIn, newUserPage, phones, publish, recordResponses } from "./helpers";

// Run-unique suffix: every spec run publishes codes no earlier run used. Kept per spec: the specs share
// one worker, so a suffix in ./helpers would repeat across specs that publish the same code prefix.
const run = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

const ALREADY_RESERVED = "Annonsen är redan reserverad eller inte längre tillgänglig.";

async function purchaseCount(page: Page): Promise<number> {
  await page.goto("/mina-kort");
  return page.getByTestId("my-purchases").locator("a.card").count();
}

async function buy(page: Page, listingPath: string) {
  await page.goto(listingPath);
  await page.getByRole("button", { name: "Köp för 850 kr" }).click();
  await page.waitForURL(/\/kop\/\d+$/);
  await expect(page.getByText("Simulerad betalning", { exact: true })).toBeVisible();
}

test("two buyers at once get exactly one reservation", async ({ browser }) => {
  const sara = await newUserPage(browser);
  const kalle = await newUserPage(browser);
  const lisa = await newUserPage(browser);
  await logIn(sara, phones.sara);
  const listingPath = await publish(sara, "Nordiska Kompagniet", `NK-RACE-${run}`);

  await logIn(kalle, phones.kalle);
  await logIn(lisa, phones.lisa);
  const before = (await purchaseCount(kalle)) + (await purchaseCount(lisa));
  for (const page of [kalle, lisa]) await page.goto(listingPath);

  const buttons = [kalle, lisa].map((p) => p.getByRole("button", { name: "Köp för 850 kr" }));
  await Promise.all(buttons.map((b) => b.click()));
  const results = await Promise.all(
    [kalle, lisa].map((page) =>
      Promise.race([
        page.waitForURL(/\/kop\/\d+$/).then(() => "reserved" as const),
        page
          .getByText(ALREADY_RESERVED)
          .waitFor()
          .then(() => "refused" as const),
      ]),
    ),
  );
  expect([...results].sort()).toEqual(["refused", "reserved"]);
  const refused = results[0] === "refused" ? kalle : lisa;
  const reserved = results[0] === "reserved" ? kalle : lisa;
  await expect(refused.locator(".note.bad[role=alert]")).toHaveText(ALREADY_RESERVED);
  await expect(reserved.getByTestId("purchase-status")).toHaveText("Påbörjat");
  await expectNoHorizontalScroll(refused);

  expect((await purchaseCount(kalle)) + (await purchaseCount(lisa))).toBe(before + 1);
});

test("declined payment and lower balance are explained", async ({ browser }) => {
  const declinedCode = `NK-NEKA-${run}`;
  const delvisCode = `DELVIS-${run}`;
  const sara = await newUserPage(browser);
  const kalle = await newUserPage(browser);
  await logIn(sara, phones.sara);
  const declinedPath = await publish(sara, "Nordiska Kompagniet", declinedCode);
  const delvisPath = await publish(sara, "Nordiska Kompagniet", delvisCode);

  const responses = recordResponses(kalle);
  await logIn(kalle, phones.kalle);

  // Declined in the "Simulerad betalning" step: Misslyckat, and the annons is in sökningen again.
  await buy(kalle, declinedPath);
  await kalle.getByRole("button", { name: "Neka betalningen" }).click();
  await expect(kalle.getByTestId("purchase-status")).toHaveText("Misslyckat");
  await expect(kalle.getByTestId("purchase-failure")).toContainText("betalningen nekades");
  await expect(kalle.getByTestId("purchase-failure")).toContainText("Inga pengar har dragits");
  await expect(kalle.getByTestId("gift-card-code")).toHaveCount(0);
  await expectNoHorizontalScroll(kalle);
  await kalle.goto("/erbjudanden");
  await expect(kalle.locator(`a.card[href="${declinedPath}"]`)).toBeVisible();

  // Approved for a DELVIS code: the butik reports 800 kr instead of 1 000 kr, nothing is drawn.
  await buy(kalle, delvisPath);
  await kalle.getByRole("button", { name: "Godkänn 850 kr" }).click();
  await expect(kalle.getByTestId("purchase-status")).toHaveText("Misslyckat");
  const explanation = kalle.getByTestId("purchase-failure");
  await expect(explanation).toContainText("saldoavvikelse");
  await expect(explanation).toContainText("800 kr");
  await expect(explanation).toContainText("1 000 kr");
  await expect(explanation).toContainText("Inga pengar har dragits");
  await expect(kalle.getByTestId("gift-card-code")).toHaveCount(0);
  await expectNoHorizontalScroll(kalle);

  await kalle.goto("/mina-kort");
  await expectNoHorizontalScroll(kalle);
  for (const body of await responses.bodies()) {
    expect(body).not.toContain(declinedCode);
    expect(body).not.toContain(delvisCode);
  }
});
