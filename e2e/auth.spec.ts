import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, shownCode } from "./helpers";

// Every page visited here runs at 360×800 (playwright.config.ts), the narrow width PRD NFR Usability names.

test("new user creates account and logs in", async ({ page }) => {
  await page.goto("/logga-in");
  await expectNoHorizontalScroll(page);
  await page.getByRole("link", { name: "Skapa konto" }).click();
  await page.waitForURL("**/skapa-konto");
  await expectNoHorizontalScroll(page);

  await page.getByLabel("Mobilnummer").fill("073-987 65 43");
  await page.getByLabel("Förnamn").fill("Nora");
  await page.getByLabel("Efternamn").fill("Berg");
  await page.getByRole("button", { name: "Skapa konto" }).click();
  await page.waitForURL("**/logga-in/kod?mobil=0739876543");
  const code = await shownCode(page);
  await expectNoHorizontalScroll(page);

  await page.getByLabel("Inloggningskod").fill(code);
  await page.getByRole("button", { name: "Logga in" }).click();
  await page.waitForURL("**/erbjudanden");
  await expect(page.locator(".who")).toContainText("Nora Berg");
});

test("wrong code then new code logs in", async ({ page, browser }) => {
  await page.goto("/logga-in");
  await page.getByLabel("Mobilnummer").fill("0707654321");
  await page.getByRole("button", { name: "Begär inloggningskod" }).click();
  await page.waitForURL("**/logga-in/kod?mobil=0707654321");
  const first = await shownCode(page);
  await expectNoHorizontalScroll(page);

  await page.getByLabel("Inloggningskod").fill(first === "000000" ? "111111" : "000000");
  await page.getByRole("button", { name: "Logga in" }).click();
  await expect(page.locator(".note.bad")).toContainText("Inloggningskoden stämmer inte");
  await expect(page.getByRole("button", { name: "Begär ny inloggningskod" })).toBeVisible();
  await expectNoHorizontalScroll(page);

  // A fresh code may by chance repeat the old six digits; request again until it differs.
  let second = first;
  for (let i = 0; i < 5 && second === first; i++) {
    await page.getByRole("button", { name: "Begär ny inloggningskod" }).click();
    await expect(page.locator(".note.bad")).toHaveCount(0);
    second = await shownCode(page);
  }
  expect(second).not.toBe(first);
  await expectNoHorizontalScroll(page);

  // Another browser opening the same step sees no "Simulerat SMS": only the requesting browser does.
  const stranger = await browser.newPage();
  await stranger.goto("/logga-in/kod?mobil=0707654321");
  await expect(stranger.getByLabel("Inloggningskod")).toBeVisible();
  await expect(stranger.getByText("Simulerat SMS", { exact: true })).toHaveCount(0);
  await stranger.close();

  await page.getByLabel("Inloggningskod").fill(second);
  await page.getByRole("button", { name: "Logga in" }).click();
  await page.waitForURL("**/erbjudanden");
  await expect(page.locator(".who")).toContainText("Kalle Berg");
});

test("wrong entry points refer with number filled", async ({ page }) => {
  // An unregistered number at inloggning: kontoskapande with the number filled in.
  await page.goto("/logga-in");
  await page.getByLabel("Mobilnummer").fill("073 111 22 99");
  await page.getByRole("button", { name: "Begär inloggningskod" }).click();
  await page.waitForURL("**/skapa-konto?**");
  await expect(page.getByRole("status")).toContainText("Det finns inget konto för 0731112299");
  await expect(page.getByLabel("Mobilnummer")).toHaveValue("0731112299");
  await expect(page.getByText("Simulerat SMS")).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  // A registered number at kontoskapande: inloggning with the number filled in.
  await page.getByLabel("Mobilnummer").fill("0707654321");
  await page.getByLabel("Förnamn").fill("Karl");
  await page.getByLabel("Efternamn").fill("Ek");
  await page.getByRole("button", { name: "Skapa konto" }).click();
  await page.waitForURL("**/logga-in?**");
  await expect(page.getByRole("status")).toContainText("Det finns redan ett konto för 0707654321");
  await expect(page.getByLabel("Mobilnummer")).toHaveValue("0707654321");
  await expectNoHorizontalScroll(page);

  // An invalid number is refused with the expected format.
  await page.getByLabel("Mobilnummer").fill("0812345678");
  await page.getByRole("button", { name: "Begär inloggningskod" }).click();
  await expect(page.locator(".note.bad")).toContainText("070 123 45 67");
  // The refused number stays in the field so it can be corrected.
  await expect(page.getByLabel("Mobilnummer")).toHaveValue("0812345678");
  await expectNoHorizontalScroll(page);
});
