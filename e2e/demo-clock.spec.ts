import { expect, test } from "@playwright/test";
import { and, eq, sum } from "drizzle-orm";
import { listings, purchases, users } from "../src/db/schema";
import {
  expectNoHorizontalScroll,
  logIn,
  newUserPage,
  phones,
  publish,
  shownPayout,
  startBuying,
  withE2eDb,
} from "./helpers";

// Moves the process-global simulated klocka: runs last, in its own Playwright project (playwright.config.ts).

const run = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/** The day after a YYYY-MM-DD date. */
function nextDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

test("demo panel moves time and applies every rule", async ({ browser }) => {
  const sara = await newUserPage(browser);
  const kalle = await newUserPage(browser);

  // The panel shows on every page in demoläge, logged in or not.
  await sara.goto("/logga-in");
  const panel = sara.getByTestId("demo-panel");
  await expect(panel.getByText("Simulerad tid", { exact: true })).toBeVisible();
  await expect(panel).toContainText("Reservation 5 min · reklamationsperiod 24 h");
  const today = (await sara.getByTestId("simulated-time").innerText()).slice(0, 10);

  // Sara: an Aktiv annons valid through today's simulated date, and one Kalle buys (Levererat).
  await logIn(sara, phones.sara);
  const expiringPath = await publish(sara, "ICA", `CLK-ICA-${run}`, 500, 400, today);
  const soldPath = await publish(sara, "Nordiska Kompagniet", `CLK-NK-${run}`);
  await logIn(kalle, phones.kalle);
  const purchasePath = await startBuying(kalle, soldPath);
  await kalle.getByRole("button", { name: "Godkänn 850 kr" }).click();
  await expect(kalle.getByTestId("purchase-status")).toHaveText("Levererat");
  const payoutBefore = await shownPayout(sara);
  // Read only: other specs' Levererat köp of Sara's annonser lapse on the same move and credit her too.
  const othersDue = pendingCreditsOfSara() - 850;

  // The demonstrator presses "+1 dag" – the panel's button only.
  await sara.getByTestId("demo-panel").getByRole("button", { name: "+1 dag" }).click();
  await expect(sara.getByTestId("simulated-time")).toContainText(nextDay(today));
  await expect(sara.getByTestId("demo-panel")).toContainText("Reservation 5 min · reklamationsperiod 24 h");

  // Kalle reloads mina kort: the köp is Avslutat (reklamationsperioden löpte ut).
  await kalle.goto("/mina-kort");
  await expect(kalle.locator(`a.card[href="${purchasePath}"]`)).toContainText("Avslutat");
  await expectNoHorizontalScroll(kalle);

  // Sara reloads mina kort: the first annons is Utgången with its explanation, her saldo raised by the köp's 850 kr.
  await sara.goto("/mina-kort");
  const expiring = sara.locator(`a.card[href="${expiringPath}"]`);
  await expect(expiring).toContainText("Utgången");
  await expect(expiring.getByTestId("expiry-reason")).toHaveText(`Har gått ut: giltighetsdatumet ${today} har passerat`);
  await expect(sara.locator(`a.card[href="${soldPath}"]`)).toContainText("Såld");
  expect(await shownPayout(sara)).toBe(payoutBefore + othersDue + 850);
  await expect(sara.getByTestId("simulated-time")).toContainText(nextDay(today));
  await expectNoHorizontalScroll(sara);
});

/** The belopp of every Levererat köp of Sara's annonser: what lapsing reklamationsperioder credit her. */
function pendingCreditsOfSara(): number {
  let total = 0;
  withE2eDb((db) => {
    const row = db
      .select({ total: sum(purchases.amount) })
      .from(purchases)
      .innerJoin(listings, eq(listings.id, purchases.listingId))
      .innerJoin(users, eq(users.id, listings.sellerId))
      .where(and(eq(purchases.status, "delivered"), eq(users.phone, phones.sara)))
      .get();
    total = Number(row?.total ?? 0);
  });
  return total;
}
