# S08: Mina kort och demoläge

**Plan**: docs/specs/applikation-for-kop-och-salj-av/plan.json
**Story-ID**: S08

## Feature Overview and Goal

**Intent**: Let each user understand where every one of their annonser and köp stands and why, and let a demonstrator show the time-dependent rules and every simulated step inside a two-minute demo, so the audience sees exactly which parts are real logic and which are simulated.

**Expected Outcomes**:

- [OC01] In "mina kort" a user sees every own annons and köp in its current status, the reason where it was flagged, expired or failed, the presentkortskod exactly where they are entitled to it, and a statushistorik with tidpunkt for each status change.
- [OC02] In demoläge the demonstrator moves the simulated klocka forward from a panel labelled "Simulerad tid", and the reservation, reklamationsperiod and utgång rules apply to the new time at once.
- [OC03] Every simulated element in FR10's list is visibly marked, and the whole demo flow and a failure flow run end to end within the PRD's Success Metrics.


## Required Context

- `docs/specs/applikation-for-kop-och-salj-av/prd.md#fr9-mina-kort` – the four criteria this story completes.
- `docs/specs/applikation-for-kop-och-salj-av/prd.md#fr10-märkning-av-simulering-och-demoläge` – the element list the walkthrough checks and the clock criterion; stories S01 and S05 own the rest.
- `docs/specs/applikation-for-kop-och-salj-av/prd.md#success-metrics` – the targets scenarios S10, S11 and S12 run against.
- `docs/specs/applikation-for-kop-och-salj-av/prd.md#user-flows` – flow 1 is scenario S10's script, flow 3 scenario S11's.
- `docs/specs/applikation-for-kop-och-salj-av/s06-avslut-reklamation-och-tvist.md#implementation-tasks` – TI02 owns which köp statuses show the presentkortskod; TI09 owns the "Simulerad utbetalning" element in mina kort.
- `docs/specs/applikation-for-kop-och-salj-av/s07-utgang-av-annonser.md#implementation-tasks` – TI07's Utgången explanation in the säljare's list, which this story keeps.
- `docs/specs/applikation-for-kop-och-salj-av/s05-kopets-felvagar-och-samtidighet.md#implementation-tasks` – TI07/TI09: `expireDue`, its call paths and the sweep the panel joins.
- `docs/specs/applikation-for-kop-och-salj-av/s01-walking-skeleton-for-demoflodet.md#constraints--gotchas` – the demo clock offset lives on `globalThis`; TI03 there defines the movable Clock and the demoläge flag.
- `docs/adrs/ADR-005-klocka-och-svep.md#decision` – call path (3): `expireDue` runs directly when the demo clock moves; Implementation Notes name the panel "Simulerad tid".
- `docs/adrs/ADR-004-vitest-playwright.md#decision` – e2e runs against the app started in demoläge with a movable clock.
- `docs/UBIQUITOUS_LANGUAGE.md` – Swedish status names, Utbetalningssaldo, Simulerad klocka, Demoläge.
- `docs/prototype/presentkortsmarknaden.html` – the "Demopanel" aside (Simulerad tid, +1 min/+5 min/+1 dag, config line) and `vMine` (lists, empty states, copy); reference, not binding.


## Acceptance Scenarios

- **S01 [OC01] Säljarens mina kort visar varje annons med status och orsak**
  - **Given** Sara has six annonser – Aktiv, Reserverad, Såld, Flaggad with flaggningsorsak saldoavvikelse, Utgången with giltighetsdatum 2026-11-17, and Återkallad – and an utbetalningssaldo of 850 kr
  - **When** Sara opens "mina kort"
  - **Then** each annons is listed with handlare, pris, saldo and its Swedish status name; the Flaggad one shows "saldoavvikelse", the Utgången one story S07's explanation with 2026-11-17; the utbetalningssaldo 850 kr sits in story S06's "Simulerad utbetalning" element

- **S02 [OC01] Köparens mina kort visar varje köp, koden bara där köparen har rätt till den**
  - **Given** Kalle has köp in Påbörjat, Levererat, Avslutat, Tvist, Återbetalat, and Misslyckat with orsak "betalningen nekades"
  - **When** Kalle opens "mina kort"
  - **Then** each köp is listed with handlare, belopp and its Swedish status name; the presentkortskod appears for Levererat, Avslutat and Tvist only (story S06's rule); the Misslyckat köp shows "betalningen nekades"; the Påbörjat köp leads back to its payment step; and no response Kalle receives contains the Påbörjat, Återbetalat or Misslyckat köp's presentkortskod

- **S03 [OC01] Statushistorik med tidpunkt**
  - **Given** Kalle's köp of Sara's annons went Påbörjat 12:00:05 → Betalning auktoriserad 12:00:20 → Levererat 12:00:21 on 2026-11-17, Swedish time
  - **When** Kalle opens the köp from "mina kort", and Sara opens the annons from "mina kort"
  - **Then** Kalle sees the köp's statushistorik oldest first, each row with tidpunkt in Swedish time (e.g. "2026-11-17 12:00:21"), status and orsak; Sara sees the annons's statushistorik the same way, from publicering through Såld, including any edit rows

- **S04 [OC01] Statushistoriken visas bara för ägaren**
  - **Given** scenario S03's köp and annons, and Lisa logged in
  - **When** Kalle opens Sara's annons, and Lisa opens Kalle's köp and Sara's annons
  - **Then** Kalle and Lisa receive no annons statushistorik, Lisa's request for the köp is refused, and none of their responses carry a statushistorik row

- **S05 [OC01] Tomma lägen**
  - **Given** Lisa has no annonser and no köp
  - **When** Lisa opens "mina kort"
  - **Then** the annons section says she has no annonser with a link to publicera, the köp section says she has bought no cards with a link to sökningen, and her utbetalningssaldo shows 0 kr

- **S06 [OC02] Demopanelen flyttar klockan och tillämpar alla tidsregler direkt**
  - **Given** demoläge, the simulated klocka at 2026-11-17 12:00:00 Swedish time, a köp Påbörjat with the reservation until 12:05:00, a köp Levererat at 12:00:00, and an Aktiv annons with giltighetsdatum 2026-11-17
  - **When** the demonstrator presses "+5 min", then "+1 dag"
  - **Then** right after "+5 min" – before any sweep tick – the first köp is Misslyckat with orsak "reservationen gick ut" and its annons Aktiv; right after "+1 dag" the Levererat köp is Avslutat with the säljare credited once and the annons is Utgången; the panel shows "Simulerad tid" 2026-11-17 12:05 and then 2026-11-18 12:05, and the configured times (reservation 5 min, reklamationsperiod 24 h) are unchanged

- **S07 [OC02] Demopanelen nekas utanför demoläge och flyttar bara framåt**
  - **Given** the app with demoläge off, and in a second case on
  - **When** a page is opened and a clock move is requested – with demoläge off any move, with demoläge on a zero or negative step
  - **Then** with demoläge off no page shows the panel, the move is refused and `Clock.now()` stays system time; with demoläge on the move is refused and the simulated klocka is unchanged

- **S08 [OC02] [runtime] Demopanelen i den startade appen**
  - **Given** the app started with README's start command, Sara's Aktiv annons with giltighetsdatum equal to today's simulated date, and Kalle's Levererat köp of another annons of Sara's
  - **When** the demonstrator presses "+1 dag" in the panel, and Kalle and Sara reload "mina kort"
  - **Then** Kalle sees the köp Avslutat, Sara sees the first annons Utgången with its explanation and her utbetalningssaldo raised by the köp's belopp, and the panel's "Simulerad tid" moved by one day
  - **Proof**: `e2e/demo-clock.spec.ts#demo panel moves time and applies every rule` – red at spec time

- **S09 [OC03] [runtime] Varje simulerat element är märkt (FR10-genomgång)**
  - **Given** the app started with README's start command
  - **When** a walkthrough shows the inloggningskod, a publicering the butikskontroll approves and one it rejects (`OGILTIG`), the payment step, a köp the butikskontroll fails at köp (`DELVIS`), an Återbetalat köp, the säljare's utbetalningssaldo and the demo panel
  - **Then** each carries its visible label – "Simulerat SMS", "Kontrollerad (simulerat)", "Simulerad butikskontroll" on both rejections, "Simulerad betalning", "Simulerad återbetalning", "Simulerad utbetalning", "Simulerad tid" – so 100 % of FR10's list is marked
  - **Proof**: `e2e/demo-journey.spec.ts#every simulated element is labelled` – red at spec time

- **S10 [OC03] [runtime] Hela demoflödet på högst 2 minuter**
  - **Given** the app freshly started with README's start command and no data written by the test outside the UI
  - **When** PRD User Flow 1 runs: Sara logs in and publishes NK saldo 1 000 kr for 850 kr; Kalle logs in, filters on NK, opens the annons (15 % rabatt), buys, approves, sees the code and Levererat, confirms "Kortet fungerade"
  - **Then** Sara's "mina kort" shows the annons Såld and utbetalningssaldo 850 kr, Kalle's shows the köp Avslutat with the code and its statushistorik, and the whole flow completes within 120 s wall time
  - **Proof**: `e2e/demo-journey.spec.ts#demo flow end to end within two minutes` – red at spec time

- **S11 [OC03] [runtime] Felflöde nekad betalning end-to-end**
  - **Given** the app started with README's start command and Sara's Aktiv NK annons
  - **When** Kalle buys it and chooses "Neka betalningen"
  - **Then** Kalle sees no presentkortskod; his "mina kort" lists the köp Misslyckat with orsak "betalningen nekades" and its statushistorik; the annons is back in Kalle's sökning; Sara's "mina kort" shows it Aktiv
  - **Proof**: `e2e/demo-journey.spec.ts#declined payment flow is visible in my cards` – red at spec time

- **S12 [OC03] Alla sju prioriterade felscenarier spårbara till gröna tester**
  - **Given** README's felscenario table
  - **When** the fast and full test tiers run with README's commands
  - **Then** the table lists PRD Edge Cases scenarios 1–7, each with at least one test (file and test name) that exists in the repo, and all of them pass


## Structural Criteria

- **SC01** The simulated klocka changes only through the demo clock's advance function, and no code outside the Clock module reads system time (story S01's SC02, which this diff could break).
- **SC02** The presentkortskod reaches mina kort and statushistorik data only through story S06's authorized code function; no query this story adds selects the code column.
- **SC03** This story adds no row to the allowed-transitions table and no status write path: every status change the panel causes runs through `expireDue`'s existing rules.
- **SC04** "Mina kort", the annons view and the köp page with statushistorik, and the demo panel have no horizontal scroll at 360 px width (PRD NFR Usability).


## Scope & Boundaries

### Work Areas
- `src/domain/` – demo clock advance, mina kort queries (all statuses, orsak, empty), statushistorik read for owners
- `src/app/` – demo panel in the root layout, "mina kort", statushistorik on the annons view and the köp page, "Simulerad butikskontroll" label on butikskontroll rejections at publicering and köp
- `README.md` – felscenario table and FR10 label list
- `playwright.config.ts` – worker and ordering setup for the clock-moving spec
- `tests/domain/`, `tests/my-cards/`, `tests/demo/`, `tests/docs/`, `e2e/demo-clock.spec.ts`, `e2e/demo-journey.spec.ts`

### What We're NOT Doing
- New time rules or changes to them – stories S05–S07 own reservation, reklamationsperiod and utgång; the panel only moves the clock and calls `expireDue`.
- Moving the clock backwards, freezing it, or setting an absolute time – FR10 asks only to "flytta fram".
- The prototype's "Logga in som" shortcut and "Kör två samtidiga köp" button – no PRD criterion; story S05's e2e proves the race.
- Rewriting stories S03, S05 and S07's fixture-based e2e to use the panel – they stay valid; this story proves the same states through the panel in its own spec.
- The köp status of a sold annons in the säljare's list – FR9 lists the säljare's annonser, not their buyers' köp.
- Changing orsak and message copy pinned by stories S03–S07 – this walkthrough keeps it.
- The timed human demo at the course presentation – a person's run, outside any task.


## Architecture Decision

**Approach**: One domain function advances story S01's offset Clock by a positive step and then calls `expireDue(clock.now())` before returning, refused unless the config's demoläge flag is on; a server action wraps it and the panel, a small client component in the root layout, calls the action and refreshes the router. Mina kort and statushistorik extend story S01's my-cards query and the existing annons view and köp page.
**Why this over the floor**: the floor is the sweep alone advancing real time; FR10 requires the demonstrator to move the clock forward and see every rule apply, which a 24 h reklamationsperiod and a day-long giltighet make impossible in a two-minute demo.


## Constraints & Gotchas

- **Constraint**: The simulated klocka is process-global, so a clock move in one e2e spec shifts reservations, reklamationsperioder and giltighet in every spec sharing the app. – Workaround: run the e2e suite with one worker and put `e2e/demo-clock.spec.ts` in a Playwright project that depends on all others, so it runs last; specs publish annonser with giltighetsdatum at least two days ahead unless they test utgång.
- **Constraint**: Next.js serves cached router state after a server action. – Workaround: the panel's action revalidates the layout and the client calls `router.refresh()`, so the current page shows the new statuses at once.
- **Constraint**: Statushistorik rows of an annons can name a seller's edit (story S03's orsak). – Workaround: annons statushistorik goes only to its säljare; the köpare sees the köp's statushistorik only (scenario S04).


## Implementation Plan

### Implementation Tasks

- **TI01** `advanceDemoClock(ms)` adds a positive step to the demo clock's offset and runs `expireDue` at the new time before returning; it refuses a step ≤ 0 and refuses any call when demoläge is off, leaving the clock unchanged.
  - Pattern: the offset Clock in `src/domain/clock.ts` and `expireDue` in `src/domain/expire-due.ts`.
  - **Verify**: `tests/domain/demo-clock.test.ts#advance applies every time rule immediately and only forward in demo mode` – scenario S06's three fixtures without a sweep tick: statuses, orsak, one credit, Utgången after the moves; scenario S07's refusals with the clock unchanged; plus `tests/domain/sweep.test.ts#sweep sees the advanced demo clock` – the sweep's `now` equals the advanced time
  - **SATISFIES**: S06, S07, SC01, SC03

- **TI02** In demoläge every page shows the demo panel: heading "Simulerad tid", the simulated time in Swedish time (date and HH:MM), buttons "+1 min", "+5 min", "+1 dag", and the configured reservation and reklamationsperiod read from config; with demoläge off it is not rendered.
  - Depends on TI01. Pattern: the prototype's "Demopanel" aside.
  - **Verify**: `tests/demo/demo-panel.test.ts#panel data shows simulated time and config only in demo mode` – panel data at a fixed Clock formats 2026-11-17 12:05 Swedish time, the config line holds 5 min and 24 h, and is absent with demoläge off
  - **SATISFIES**: S06, S07

- **TI03** The säljare's "mina kort" lists every own annons, newest first, in all six statuses with handlare, pris, saldo, Swedish status name, the flaggningsorsak when Flaggad and story S07's explanation when Utgången; with none, an empty state links to publicera.
  - Pattern: story S01's my-cards query in `src/domain/`.
  - **Verify**: `tests/my-cards/my-cards.test.ts#seller sees every listing status with reason and an empty state` – scenario S01's six annonser and their fields; scenario S05's annons half
  - **SATISFIES**: S01, S05

- **TI04** The köpare's "mina kort" lists every own köp, newest first, in all seven statuses with handlare, belopp and Swedish status name, the presentkortskod through story S06's authorized code function, the orsak when Misslyckat and a link to the payment step while Påbörjat or Betalning auktoriserad; with none, an empty state links to sökningen.
  - **Verify**: `tests/my-cards/my-cards.test.ts#buyer sees every purchase status with code only where entitled and an empty state` – scenario S02's köp, the serialized data free of the three excluded köp's codes; scenario S05's köp half and 0 kr utbetalningssaldo
  - **SATISFIES**: S02, S05, SC02

- **TI05** The annons view shows its statushistorik to its säljare and the köp page shows the köp's statushistorik to its köpare – oldest first, each row with tidpunkt in Swedish time, status and orsak; nobody else receives either on these pages (the demoadministratör's Tvister view keeps its köp statushistorik, story S06's TI08).
  - **Verify**: `tests/my-cards/status-history.test.ts#owner sees history with swedish time and others receive none` – scenario S03's rows and formatted tidpunkter under a fixed Clock, including an annons edit row; scenario S04's views serialized without any history row and Lisa's köp request refused
  - **SATISFIES**: S03, S04, SC02

- **TI06** Each butikskontroll rejection shown at publicering and each köp failure caused by the butikskontroll is shown inside an element labelled "Simulerad butikskontroll", keeping stories S03 and S05's message text.
  - **Verify**: `e2e/demo-journey.spec.ts#every simulated element is labelled` – scenario S09's walkthrough at 360×800, asserting each of the seven labels visible on its element
  - **SATISFIES**: S09

- **TI07** Playwright runs the e2e suite with one worker, and `e2e/demo-clock.spec.ts` in a project depending on all other projects so it runs last.
  - **Verify**: `cmd: npx playwright test --list` – lists `demo-clock.spec.ts` under its own project; plus `inspect: playwright.config.ts` – sets `workers: 1` and orders the clock project last
  - **SATISFIES**: S08

- **TI08** Playwright proves scenario S08 against the app started by `dev`, pressing the panel's buttons only, with the Levererat köp and the annons created through the UI.
  - Depends on TI02, TI03, TI04, TI07.
  - **Verify**: `e2e/demo-clock.spec.ts#demo panel moves time and applies every rule` – scenario S08's outcomes and `scrollWidth <= clientWidth` with the panel on "mina kort"
  - **SATISFIES**: S08, SC04

- **TI09** Playwright runs PRD User Flows 1 and 3 through the UI only, timing flow 1.
  - Depends on TI03, TI04, TI05.
  - **Verify**: `e2e/demo-journey.spec.ts#demo flow end to end within two minutes` – scenario S10's outcomes and elapsed time ≤ 120 000 ms; `e2e/demo-journey.spec.ts#declined payment flow is visible in my cards` – scenario S11's outcomes; both at 360×800 with `scrollWidth <= clientWidth` on "mina kort", the annons view and the köp page
  - **SATISFIES**: S10, S11, SC04

- **TI10** README carries a "Prioriterade felscenarier" table mapping PRD Edge Cases scenarios 1–7 to test file and test name, and a list of FR10's simulated elements with their labels.
  - **Verify**: `tests/docs/readme-traceability.test.ts#every prioritized failure scenario maps to an existing test` – parses the table, asserts seven rows numbered 1–7, each named file exists and contains the named test; plus `cmd: npm run test:full` – both tiers green
  - **SATISFIES**: S12

- **TI11** No new system-time read, no new allowed transition, and no new select of the code column.
  - **Verify**: `cmd: test -z "$(git grep -nE 'Date\.now\(|new Date\(\)' -- src ':!src/domain/clock.ts')"` – no system-time read outside the Clock module; plus `inspect: src/domain/transition.ts` – the allowed-transitions table unchanged by this story, and `inspect: src/domain/my-cards.ts` – the code reaches mina kort only through the authorized code function
  - **SATISFIES**: SC01, SC02, SC03


## Settled Decisions

- The panel is shown to every visitor in demoläge, logged in or not, since it serves the demonstrator.
- The panel offers the prototype's steps "+1 min", "+5 min" and "+1 dag" and only forward moves.
- The panel shows the simulated time as of the last render or move (date and HH:MM, Swedish time), not a ticking clock.
- Butikskontroll rejections at publicering and köp count as "butikskontroll" in FR10's list and are labelled "Simulerad butikskontroll" (the prototype panel's heading).
- Copy and orsak texts pinned by stories S03–S07 stand unchanged; this walkthrough adds labels only.
- Statushistorik rows show tidpunkt, status and orsak, not the aktör.
- Annons statushistorik is shown only to its säljare and köp statushistorik only to its köpare, plus the demoadministratör for a köp in Tvist (story S06).
- The automated flow-1 run under 120 s proves the flow fits "≤ 2 min"; after this story the plan stops for the team's own look before ship: a timed human run of demo flow 1 (≤ 2 min) and a walkthrough of every simulated element in FR10's list. Neither is an agent gate.
- Stories S03, S05 and S07's fixture-based e2e stay as they are.


## Discovered Requirements

- **Title**: Landed data and e2e facts the panel and mina kort build on
  - **Description**:
    - `PurchaseView` carries `failureReason`; `ListingDto`/`ListingViewDto` carry `flagReason`; the annons view's kontroll pill shows "Ej godkänd" while a flaggningsorsak is set.
    - Statushistorik reasons already written: "ändrad: …", "rättad: …, kontrollerad (simulerat)", "återkallad av säljaren" (S03); S05's failure orsaker (e.g. "reservationen gick ut", the saldoavvikelse explanation in the köp's orsak, flaggningsorsak "saldoavvikelse").
    - `getCurrentDeps()` (`src/server/deps.ts`) runs `expireDue` before a read; the demo panel's action may use it or call `expireDue` directly as TI01 says.
    - e2e: sökningen redirects a logged-out visitor to `/logga-in?hanvisning=erbjudanden`; `e2e/search.spec.ts` relies on the seeded Åhléns annons having 4 days left for its short-validity warning, so a test that moves the demo clock must not run before it against the same database, or must reset it; e2e DB fixtures open `process.env.DATABASE_PATH ?? "data/e2e.db"`, so a config on another port needs the matching `DATABASE_PATH`.
    - Login helpers are duplicated across `e2e/demo-flow.spec.ts`, `e2e/auth.spec.ts`, `e2e/manage-listing.spec.ts`, `e2e/purchase-failures.spec.ts`; extract them if this story adds another spec that needs them.
  - **Rationale**: S03–S05 landed after this FIS was written.
  - **Interpretation**: Build on these; keep the shared e2e database's seeded state intact for other specs.
  - **Traced from**: S03/TI10, S04/TI06, S04/TI07, S05/TI09, S05/TI10
  - **Date**: 2026-11-17
- **Title**: Build on S06's and S07's mina kort, köp page and history shapes
  - **Description**:
    - `MyCards` carries `payoutBalance`, shown at the top of mina kort in a "Simulerad utbetalning" SimBox (`data-testid="payout-balance"`); keep it.
    - `MyListing = ListingDto & { expiryReason }` (S07) reads the orsak from the latest →expired statushistorik row with one query per Utgången annons, rendered as "Har gått ut: …" (`data-testid="expiry-reason"`). The orsak-for-every-status work generalises or replaces this – one query for the whole list – and keeps or supersedes that text.
    - The köp page (`src/app/kop/[id]/page.tsx`, `getPurchasePage`) shows the code block with the "Klart! Visa koden i kassan." note for Levererat, Avslutat and Tvist alike; per-status copy belongs to this story (a Tvist köp must not read "Klart!").
    - S06 added a `.history` list style and `DisputeHistoryRow` (`at`, `actor`, `reason`, `status`) with `actorName` in `src/domain/disputes.ts` ("system", "demoadministratören", or the user's full name); the statushistorik view reuses it rather than adding a second formatter.
    - Moving the demo clock triggers, through `expireDue`, in order: reserved-past-validity (köp Misslyckat "kortet har gått ut", annons Utgången), reservation expiry, Aktiv/Flaggad past validity (Utgången), and reklamationsperiod lapse (Levererat → Avslutat with credit, when `deliveredAt + claimPeriodMs <= now`).
    - The demoadministratör's phone (0700000000) is not in the shared `e2e/helpers.ts` `phones`; `e2e/after-delivery.spec.ts` keeps its own `ADMIN_PHONE`. Add it there if this story's e2e needs the admin.
  - **Rationale**: S06 and S07 landed after this FIS was written and changed the surfaces it extends.
  - **Interpretation**: Extend these shapes; add no second history formatter or orsak query path.
  - **Traced from**: S06/TI09, S06/TI08, S07/TI07
  - **Date**: 2026-11-17


## Implementation Observations

- `advanceDemoClock(deps, ms)` lives in `src/domain/demo-clock.ts` with `getDemoPanel` (panel data: simulated time, config line, steps) and the step table `DEMO_STEPS`; the server action `src/server/actions/demo.ts` accepts only a step id ("1m", "5m", "1d"), so a crafted post cannot jump the clock by an arbitrary amount – an unknown id maps to 0 and is refused by the domain. The panel (`src/components/demo-panel.tsx`) sits above every page in the root layout and calls `router.refresh()` after the action.
- Statushistorik has one reader, `statusHistoryOf` in `src/domain/status-history.ts`, moved out of `src/domain/disputes.ts` (Tvister keeps its aktör column through it); owner views use `ownerHistory`, which drops the aktör (Settled Decisions). The annons page's data moved into `getListingPage` (`src/domain/listings.ts`), which hands the code and history to the säljare only; the köp page's `getPurchasePage` carries `history` and a per-status `codeNote` (a Tvist köp no longer reads "Klart!").
- Statushistorik tidpunkt is shown to the second (`formatStockholmTimestamp` in `src/domain/dates.ts`), as scenario S03's example "2026-11-17 12:00:21" asks; other times keep HH:MM.
- "Simulerad butikskontroll": a `verification_failed` refusal carries `simulated` in `ActionResult` and renders inside a SimBox at its field (publicering and rättning alike); a köp failure carries `failedAtCheck` on `PurchaseView` (reasons of the butikskontroll at köp, now named constants in `purchases.ts`), shown as a SimBox on the köp page and a sim pill in mina kort.
- `listingsOfSeller` now orders newest first; the Utgången orsak for the whole list is one query (`expiryReasonsOf`), keeping `expiryReason` and the "Har gått ut: …" text.
- Mina kort's empty states are `MY_CARDS_EMPTY` in `src/domain/my-cards.ts`; `MyCards` keeps its shape, so S01's Lisa assertion stands.
- `e2e/demo-flow.spec.ts`'s `getByText("Aktiv")` became `.hero`-scoped: the säljare's annons view now also shows "Aktiv" in its statushistorik (strict-mode clash). Harness change only; the assertion is the same status pill.
- ASSUMPTION: scenario S10's "utbetalningssaldo 850 kr" is asserted as Sara's saldo before the flow plus 850 kr (read in the UI before the timer starts), since the shared e2e database carries other specs' credits – a dedicated fresh database for the journey spec would let it assert 850 kr exactly.
- ASSUMPTION: scenario S08's "saldo raised by the köp's belopp" is asserted as before + 850 kr + every other Levererat köp of Sara's annonser, read (not written) from the e2e database just before the move – in the shared suite, other specs' Levererat köp lapse on the same "+1 dag". A spec-private database would make the read unnecessary.
- `e2e/helpers.ts` gained `startBuying` and `shownPayout` and an optional `validUntil` on `publish`/`fillPublishForm`.
- NOTICED BUT NOT TOUCHING: `e2e/after-delivery.spec.ts` keeps its own `buyAndReceive`/`payoutShown` and `e2e/purchase-failures.spec.ts` its own `buy`, now duplicating `startBuying`/`shownPayout` in `e2e/helpers.ts`; Tvister (`src/app/tvister/page.tsx`) still formats history to the minute.
- Review note (N1, LOW, Routing: Note): `failedAtCheck` classifies a köp failure by matching the stored `failureReason` against the `CHECK_*` constants in `src/domain/purchases.ts`; if those orsak strings ever change, earlier köp lose their "Simulerad butikskontroll" label. A stored failure-cause column would remove the coupling; not needed while S03–S07's copy is pinned.
