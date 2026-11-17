# S01: Walking skeleton för demoflödet

**Plan**: docs/specs/applikation-for-kop-och-salj-av/plan.json
**Story-ID**: S01

## Feature Overview and Goal

**Intent**: Prove the marketplace's core promise end to end on a real server and database – a seller's verified gift card reaches a buyer as a delivered code, and nobody else – so every later story thickens a running flow instead of building in the dark.

**Expected Outcomes**:

- [OC01] On a freshly started local app, a seller publishes a gift card and a buyer finds it, buys it and sees the presentkortskod with status Levererat, while the seller sees the annons as Såld.
- [OC02] The presentkortskod reaches nobody but the säljare and, after leverans, the köpare; no dragning or leverans happens without a passed butikskontroll.
- [OC03] Every simulated step in the flow is visibly marked, behaves deterministically from a documented table, and the demo starts in demoläge with one documented command.


## Required Context

- `docs/specs/applikation-for-kop-och-salj-av/prd.md#user-flows` – flow 1 is the path this story builds up to "ser koden och statusen Levererat"; confirmation and payout are story S06's.
- `docs/specs/applikation-for-kop-och-salj-av/prd.md#data-requirements` – the entities and fields the schema holds, all of them, though S01 writes only some.
- `docs/specs/applikation-for-kop-och-salj-av/prd.md#fr5-köp-med-reservation-auktorisering-och-leverans` – step order and the happy-path criteria (1, 3, 4) this story implements.
- `docs/specs/applikation-for-kop-och-salj-av/prd.md#fr10-märkning-av-simulering-och-demoläge` – labels, configurable times, deterministic verifier, demo start; the demo panel is story S08's.
- `docs/adrs/ADR-001-typescript-nextjs-sammanhallen-app.md#decision` – one Next.js App Router app, domain logic in plain TypeScript, code read only server-side after an authorization check.
- `docs/adrs/ADR-002-sqlite-drizzle.md#decision` – SQLite file via Drizzle + better-sqlite3, recreated and seeded on demo start, own database per test run.
- `docs/adrs/ADR-003-atomara-statusovergangar.md#implementation-notes` – the shared `transition` helper's contract.
- `docs/adrs/ADR-004-vitest-playwright.md#decision` – test tiers and npm scripts.
- `docs/adrs/ADR-005-klocka-och-svep.md#decision` – `Clock` interface; `expireDue` and the sweep are story S05's.
- `docs/DECISIONS.md#still-current` – the three adapter interfaces.
- `docs/UBIQUITOUS_LANGUAGE.md` – Swedish UI terms and their English code identifiers.
- `docs/prototype/presentkortsmarknaden.html` – visual and copy reference (CSS tokens, `MERCHANTS`, seeded users in `S.users`, verifier table in the demo panel, `simbox` styling); not a binding spec.


## Acceptance Scenarios

- **S01 [OC01] [runtime] Walking skeleton: publicera → hitta → köpa → se kod**
  - **Given** the app started with README's start command, and two browser sessions for seeded test users Sara (säljare) and Kalle (köpare)
  - **When** Sara logs in with the code from the simulated SMS, publishes an NK card with saldo 1 000 kr, pris 850 kr and a giltighetsdatum a year ahead; Kalle logs in, finds the annons in sökningen, opens it, buys it and approves the simulated payment
  - **Then** Kalle sees the presentkortskod, status Levererat and a kvitto with belopp 850 kr and tidpunkt; Kalle's "mina kort" lists the köp with the code and Levererat; Sara's "mina kort" lists the annons as Såld
  - **Proof**: `e2e/demo-flow.spec.ts#demo flow publish find buy see code` – red at spec time

- **S02 [OC01] Inloggning med simulerad SMS-kod**
  - **Given** a seeded user with mobilnummer 0701234567
  - **When** the user requests an inloggningskod and enters the six-digit code shown in the box labelled "Simulerat SMS"
  - **Then** the user is logged in, and the pages of this story redirect a visitor without a session to inloggning

- **S03 [OC01] Publicerad annons blir Aktiv och syns i sökningen**
  - **Given** Sara is logged in
  - **When** she submits handlare NK, a code the butikskontroll answers giltig with the same saldo, saldo 1 000 kr, pris 850 kr and a future giltighetsdatum
  - **Then** the annons has status Aktiv, is marked "Kontrollerad (simulerat)", its statushistorik holds the creation with tidpunkt, aktör Sara and orsak, and Kalle's sökning lists it with handlare, saldo, pris, giltighetsdatum and kontrollstatus

- **S04 [OC01] Köp reserverar, auktoriserar, kontrollerar, drar och levererar**
  - **Given** Sara's Aktiv annons at pris 850 kr and Kalle logged in
  - **When** Kalle starts a köp
  - **Then** the annons is Reserverad for Kalle until now + the configured reservationstid (5 min) and a köp exists with status Påbörjat and belopp 850 kr
  - **When** Kalle approves in the step marked "Simulerad betalning"
  - **Then** the köp passes Betalning auktoriserad, the butikskontroll runs again and answers giltig with at least the annons's saldo, the authorization is captured exactly once, the köp becomes Levererat and the annons Såld, and each status change has a statushistorik row with tidpunkt, aktör and orsak

- **S05 [OC02] Presentkortskoden når ingen annan**
  - **Given** Sara's Aktiv annons with presentkortskod `NK-4471-9920`, and a third user Lisa
  - **When** Kalle views sökningen and the annons before buying, and Lisa views sökningen, the annons and her "mina kort" after Kalle's köp is Levererat
  - **Then** no page, server-action response or API response they receive contains `NK-4471-9920`, while Sara sees it on her own annons and Kalle sees it after leverans

- **S06 [OC02] Butikskontrollen nekar vid köp – ingen dragning, ingen kod**
  - **Given** an Aktiv annons whose presentkortskod starts with `ANVAND` (giltig at publicering, ogiltig at köp per scenario S08's table)
  - **When** Kalle buys it and approves the simulated payment
  - **Then** no capture is made, the köp never reaches Levererat, and Kalle sees no presentkortskod; the köp's and annons's resulting statuses and the void of the authorization are story S05's

- **S07 [OC03] [runtime] Simulerade steg är märkta**
  - **Given** the demo flow of scenario S01
  - **When** the simulated SMS, the butikskontroll result and the payment step are shown
  - **Then** they carry the visible labels "Simulerat SMS", "Kontrollerad (simulerat)" and "Simulerad betalning" respectively
  - **Proof**: `e2e/demo-flow.spec.ts#simulated steps are labelled` – red at spec time

- **S08 [OC03] Butikskontrollen svarar deterministiskt efter en dokumenterad tabell**
  - **Given** the README table keyed on presentkortskod prefix: `OGILTIG` → ogiltig at both phases; `ANVAND` → giltig at publicering, ogiltig at köp; `DELVIS` → giltig at publicering, saldo 200 kr lägre at köp; `SALDO` → giltig with a fixed kontrollerat saldo of 800 kr at both phases; `TIMEOUT` → inget svar; `FEL` → fel; any other code → giltig with the uppgivna saldot
  - **When** the GiftCardVerifier is called for each row at publicering and at köp, repeatedly
  - **Then** each call returns that row's outcome, identical on every call, and the PaymentProvider's authorization outcome follows only the köpare's approve/decline choice

- **S09 [OC03] [runtime] Demostart nollställer och fyller databasen**
  - **Given** a database left over from an earlier run holding a published annons
  - **When** the app is started with README's start command
  - **Then** it runs in demoläge with a fresh marketplace: only the five handlare (Nordiska Kompagniet, Åhléns, Filmstaden, Clas Ohlson, ICA), the demoadministratör, the test users README lists, and four seeded Aktiv annonser by Sara at Åhléns, Filmstaden, Clas Ohlson and ICA (none at NK; presentkortskoder prefixed `SEED`, each with its creation statushistorik row) exist, the earlier run's annons is gone, and the publish form offers exactly those handlare

- **S10 [OC01] Tunn "mina kort"**
  - **Given** Kalle's köp is Levererat for Sara's annons
  - **When** each opens "mina kort"
  - **Then** Kalle sees the köp with handlare, belopp, status Levererat and the presentkortskod; Sara sees her annons with pris, saldo and status Såld


## Structural Criteria

- **SC01** Every status change of annons and köp goes through one `transition` function: a conditional UPDATE on the prior status counting affected rows, with its statushistorik row in the same transaction; a repeat of a completed transition changes nothing and returns a domain error; a transition absent from the allowed-transitions table is refused with a domain error.
- **SC02** No code outside the Clock module reads system time.
- **SC03** Every screen this story adds has no horizontal scroll at 360 px width (PRD NFR Usability).
- **SC04** A fresh clone installs, starts and runs both test tiers with only the commands README lists, and `CLAUDE.md` carries them as Key Dev Commands.
- **SC05** No presentkortskod and no server-action input reaches a log (PRD NFR Security): nothing in `src/` logs action payloads, and the console output captured during the demo flow never contains the presentkortskod.
- **SC06** Every server action that changes data refuses a call without a session, and the payment step (page and approve/decline action) acts only for the köp's köpare; anyone else is refused without the köp changing.


## Scope & Boundaries

### Work Areas
- Project scaffold: `package.json`, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `.gitignore`
- `src/db/` – Drizzle schema, migrations, client factory, reset-and-seed
- `src/domain/` – Clock, config, `transition` and allowed-transitions table, auth, listings, purchases, my cards
- `src/adapters/` – `SmsSender`, `GiftCardVerifier`, `PaymentProvider` and their simulated implementations
- `src/app/` – pages and server actions: inloggning, publicera, sökning, annons, köp/betalsteg, mina kort
- `tests/`, `e2e/`
- `README.md`, `CLAUDE.md` (Key Dev Commands section)

### What We're NOT Doing
- Kontoskapande, wrong or expired inloggningskod, invalid mobilnummer, new code on request – story S02.
- Prisregel, past giltighetsdatum, dubblettkontroll and specific messages for each rejecting butikskontroll outcome at publicering; editing and återkallelse – story S03. S01 refuses any non-giltig outcome at publicering with one generic message and creates no annons.
- Filter, sortering, rabatt in kr and %, 7-day warning, empty state, own annonser excluded from sökningen – story S04.
- Decline control in the payment step and its handling, concurrency test, every non-giltig outcome at köp, void, reservation expiry, `expireDue` and the sweep, duplicate betalningsbesked, seller buying own annons – story S05.
- Bekräftelse, reklamation, tvist, utbetalningssaldo – story S06. Annons utgång and the giltighetsdatum check at leverans – story S07.
- Statushistorik view, flaggad/utgången orsak, empty states and the demo panel with "Simulerad tid" – story S08.
- PRD Edge Cases table rows: none is exercised here; each is owned by stories S03 and S05–S07 (narrowing note for the Edge-Cases binding constraint).
- A UI component library – CSS ported from the prototype's tokens is enough for a course demo.


## Architecture Decision

**Approach**: Domain functions in plain TypeScript under `src/domain/` take their dependencies (db, `Clock`, adapters, config) as arguments; Next.js server actions and server components are thin callers that resolve the session and pass real or simulated dependencies. Sessions are an httpOnly cookie holding a random token stored in a sessions table.
**Why this over the floor**: the floor is the HTML prototype; ADR-001 Alternatives 5 rules it out because only shared server-side storage and server-only reads prove "exakt en reservation" and secrecy of the presentkortskod (PRD NFR Security, Reliability).
**Flow**: reserve (transition annons Aktiv→Reserverad and insert köp Påbörjat in one transaction) → payment step → `PaymentProvider.authorize` → transition köp →Betalning auktoriserad → `GiftCardVerifier` at köp phase → on giltig with saldo ≥ annons saldo: transitions köp →Levererat and annons →Såld in one transaction, conditional on the annons still being Reserverad for this köp, then `PaymentProvider.capture` (the simulated capture of a valid authorization cannot fail) → code page. Leverans commits before dragning so a reservation expiring at the same instant can never leave money drawn on a failed köp (PRD Edge Cases, "aldrig båda"); story S05 adds the expiry and its race test. Any other verifier outcome stops before capture (scenario S06).


## Constraints & Gotchas

- **Constraint**: Drizzle's better-sqlite3 transactions are synchronous; an `await` inside the callback commits early or throws. – Workaround: call adapters between transactions, never inside one (the Flow above already splits them).
- **Constraint**: better-sqlite3 is a native module Next.js must not bundle. – Workaround: list it in `serverExternalPackages` in `next.config.ts`.
- **Constraint**: Next.js caches pages and module state reloads in dev. – Workaround: render status pages dynamically, and keep the db handle and demo clock offset on `globalThis` so hot reload does not open a second database or reset the clock (ADR-005 Consequences).
- **Constraint**: all e2e specs run against one `dev` database, and the dubblettkontroll (story S03) refuses a presentkortskod already used for the same handlare. – Workaround: every e2e spec builds its presentkortskoder with a run-unique suffix (keeping the verifier prefix), and never relies on sökningen being empty – it filters on the handlare under test, since the seed holds annonser.
- **Constraint**: a code the client receives in any RSC payload or action result is exposed even if never rendered. – Workaround: search and annons-view queries select a DTO without the code column; only one server function returns the code, after checking the viewer is the säljare or the köpare of a köp at Levererat.


## Implementation Plan

### Implementation Tasks

- **TI01** The repo is a Next.js App Router app in strict TypeScript on Node 24 LTS (`engines`), with npm scripts `dev` (demo start), `test` (Vitest), `test:e2e` (Playwright, starting the app through `dev`) and `test:full`, and `data/*.db` ignored by git.
  - **Verify**: `cmd: npx tsc --noEmit` – strict compile passes with `"strict": true` in `tsconfig.json`
  - **SATISFIES**: SC04

- **TI02** The Drizzle schema covers every entity in the PRD's Data Requirements (statuses stored with the code vocabulary of the plan's shared decision "Statusvokabulär och övergångar") plus sessions and inloggningskoder; a factory gives each Vitest file its own fresh database; `dev` recreates the database file and seeds the five handlare from the prototype's `MERCHANTS`, demoadministratören, test users Sara, Kalle and Lisa from the prototype's `S.users`, and scenario S09's four seeded annonser through `transition`.
  - **Verify**: `tests/db/seed.test.ts#reset and seed leaves only merchants, demo admin and test users` – asserts a pre-existing annons is gone and the seeded rows, seeded annonser and their statushistorik match S09's list
  - **SATISFIES**: S09

- **TI03** A `Clock` with a system, an offset-movable (demoläge, starting at system time) and a fixed (tests) implementation is the only time source, and one config module holds reservationstid 5 min, reklamationsperiod 24 h, inloggningskod validity 10 min and demoläge on by default, each overridable by environment variable.
  - **Verify**: `cmd: test -z "$(git grep -nE 'Date\.now\(|new Date\(\)' -- src ':!src/domain/clock.ts')"` – no system-time read outside the Clock module; plus `tests/domain/config.test.ts#times default to 5 min and 24 h and follow environment overrides`
  - **SATISFIES**: SC02

- **TI04** `transition(entity, id, from, to, actor, reason, extra)` and an allowed-transitions table holding this story's transitions (annons create→active, active→reserved, reserved→sold; köp create→started, started→authorized, authorized→delivered) implement ADR-003's contract, and `transition` runs inside a caller's transaction so the Flow's paired writes (annons and köp transitions, the köp insert) commit or roll back together; later stories add rows, never another write path.
  - **Verify**: `tests/domain/transition.test.ts#conditional update writes history once and refuses repeats and unlisted transitions` – asserts one history row per success, zero rows changed and a domain error on repeat and on an unlisted pair, and rollback of the status when the history insert fails
  - **SATISFIES**: SC01

- **TI05** `SmsSender`, `GiftCardVerifier` (publicering and köp phase) and `PaymentProvider` (authorize/capture/void/refund, idempotent capture per authorization) have simulated implementations; the verifier follows scenario S08's table, which README documents.
  - **Verify**: `tests/adapters/simulators.test.ts#verifier returns the documented outcome for every row at both phases` – also asserts authorize follows only the approve flag and README contains every table prefix
  - **SATISFIES**: S08

- **TI06** A seeded user logs in through the simulated SMS: a six-digit inloggningskod sent via `SmsSender` and shown in a box labelled "Simulerat SMS", a session cookie on the correct code, redirect to inloggning from every other page of this story without a session, and every data-changing server action refusing a call without one.
  - **Verify**: `tests/auth/login.test.ts#correct simulated sms code creates a session` – also asserts the code is six digits and reaches the UI only through the simulated SMS outbox; plus `tests/auth/actions.test.ts#data-changing actions refuse a missing session`
  - **SATISFIES**: S02, SC06

- **TI07** A logged-in user publishes an annons: butikskontroll at publicering phase, then insert as Aktiv through `transition` with orsak, labelled "Kontrollerad (simulerat)"; any non-giltig outcome creates nothing.
  - Depends on TI04, TI05.
  - **Verify**: `tests/listings/publish.test.ts#valid card becomes active with history and appears in search` – also asserts an `OGILTIG` code creates no annons
  - **SATISFIES**: S03

- **TI08** Sökningen lists Aktiv annonser with handlare, saldo, pris, giltighetsdatum and kontrollstatus, and the annons view shows the same plus a köp button, both from a DTO without the presentkortskod.
  - **Verify**: `tests/listings/search.test.ts#search and listing view never carry the gift card code` – serializes both results for a non-seller and asserts the code string is absent
  - **SATISFIES**: S03, S05

- **TI09** The köp runs per the Architecture Decision's Flow, with belopp locked to pris at reservation, a "Simulerad betalning" step offering approve that only the köp's köpare can open or act on, and a code page showing presentkortskod, Levererat and kvitto (belopp, tidpunkt) only to the köpare.
  - Depends on TI04, TI05, TI08.
  - **Verify**: `tests/purchases/purchase.test.ts#approved payment and valid check deliver the code` – asserts each status, reserved-until = now + 5 min from the fixed Clock, belopp, one capture, history rows; plus `tests/purchases/purchase.test.ts#failed check at purchase captures nothing and delivers no code` with an `ANVAND` code; plus `tests/purchases/purchase.test.ts#only the buyer can open or act on the payment step`
  - **SATISFIES**: S04, S06, SC06

- **TI10** "Mina kort" lists the logged-in user's annonser (pris, saldo, status) and köp (handlare, belopp, status, presentkortskod when Levererat), the code fetched through the single authorized code function.
  - **Verify**: `tests/my-cards/my-cards.test.ts#buyer sees delivered code, seller sees sold, third user sees neither` – covers scenario S10 and Lisa's view in scenario S05
  - **SATISFIES**: S10, S05

- **TI11** Playwright drives the walking skeleton at a 360×800 viewport against the app started by `dev`, recording every response body for Kalle before leverans and for Lisa.
  - Depends on TI06–TI10.
  - **Verify**: `e2e/demo-flow.spec.ts#demo flow publish find buy see code` – scenario S01 end to end, plus no recorded response containing the presentkortskod and `scrollWidth <= clientWidth` on each visited page, and no captured server console line containing the presentkortskod; plus `cmd: test -z "$(git grep -nE 'console\.(log|info|debug)' -- src)"` – no ad-hoc logging in `src/`; `e2e/demo-flow.spec.ts#simulated steps are labelled` – the three labels of scenario S07; `e2e/demo-flow.spec.ts#demo start offers exactly the seeded merchants` – the publish form's handlare of scenario S09
  - **SATISFIES**: S01, S05, S07, S09, SC03, SC05

- **TI12** README documents prerequisites (Node 24 LTS, `npx playwright install`), the start command and demoläge, the test commands and how to run one test, the seeded users and the verifier table; `CLAUDE.md` gains a Key Dev Commands section with the same commands, including a **run one test** row for both tiers.
  - **Verify**: `cmd: npm ci && npm run test:full` – both tiers green using only README's commands
  - **SATISFIES**: SC04


## Settled Decisions

- Node 24 LTS is the runtime.
- The verifier table extends the prototype's with `SALDO` (fixed kontrollerat saldo 800 kr at both phases, so a säljare who corrects to 800 kr passes) and `FEL` (error), so all five outcomes exist at both phases.
- The simulated verifier returns "inget svar" immediately for `TIMEOUT`, keeping tests fast; story S05 adds the 5 s timeout and a delayed-answer option for the late-answer edge case.
- The demo clock is system time plus a movable offset, so reservations also expire in real time during a demo.
- The seed holds four Aktiv annonser by Sara at handlare other than NK (scenario S09), so sökningen, filter and sortering show something at demo start while the demo flow's NK annons stays the only one at NK.
- The payment step's label is "Simulerad betalning", as in the prototype.
- Visitors without a session are redirected to inloggning on every page of this story; story S04 adds the sökning-specific hint.


## Implementation Observations

- **better-sqlite3 pinned to 12.x, not 13.x.** 13.2.0 ships prebuilds with `"gypfile": false`, but `npm ci` (npm 10.9) still ran `node-gyp rebuild` and failed on a machine without a Visual Studio that node-gyp recognises; `npm install` had succeeded, so the gap showed only under TI12's `npm ci`. 12.11.1 installs through `prebuild-install` and passes `npm ci && npm run test:full`.
- **Runtime used for verification was Node 22.15, not 24.** `engines` says `>=24` per Settled Decisions, so npm prints `EBADENGINE` on this machine; every proof ran on 22.15. Node 22 cannot run `.ts` directly, so the demo reset script runs through `tsx` (dev dependency) in `npm run dev`.
- **TypeScript 5.9, not 7.0.** npm's latest `typescript` is 7.0 (the native port); Next.js 16's type tooling targets the 5.x API, so `~5.9.3` is pinned.
- **Next.js 16 writes `AGENTS.md` on `next dev`.** Turned off with `agentRules: false` in `next.config.ts`; CLAUDE.md now points agents at `node_modules/next/dist/docs/` instead.
- **Two code functions, one viewer path.** `giftCardCodeFor` (src/domain/gift-card-code.ts) is the only function that returns a presentkortskod to a viewer; `giftCardCodeForVerification` beside it reads the code for the butikskontroll at köp and never leaves the server. Both live in the one module, so a grep for `giftCardCode` outside `src/db/schema.ts` and that module finds only DTO-free code.
- **Interim states other stories finish.** A non-giltig butikskontroll at köp leaves the köp at Betalning auktoriserad and the annons Reserverad with no capture (scenario S06); `approvePayment` throws `payment_declined` for a declined authorization, which S01's UI cannot trigger. Story S05 replaces both. An unregistered mobilnummer gets one generic message (story S02). Sökningen still lists the köpare's own annonser (story S04).
- **E2E isolation.** Playwright starts README's `npm run dev` on port 3100 with `DATABASE_PATH=data/e2e.db`, so a running demo on port 3000 and its `data/demo.db` are left alone; server output goes to `e2e/.server.log`, which the demo-flow spec scans for the code.
- **`git grep` proofs see tracked files only.** TI03's and TI11's `cmd:` proofs pass vacuously on untracked files; they were run with the new files intent-to-add (`git add -N`) and hold after the commit.
- **Tests were written straight from the tasks' Verify targets**, not through the `andthen:testing` skill; each security test was checked as falsifiable by planting the leak it guards against (code column in the search DTO → search and mina kort tests fail; code attribute on the sökning card → e2e demo-flow test fails).
- NOTICED BUT NOT TOUCHING: `npm audit` reports 4 moderate advisories in `esbuild <=0.24.2`, pulled in by the dev-only `drizzle-kit` via `@esbuild-kit/*`; `npm audit --omit=dev` is clean. Routing: Note.
- **Review (andthen:review --quick --fix)**: two fixes applied. One adds `e2e/demo-flow.spec.ts#pages redirect a visitor without a session to inloggning`, covering S02's redirect clause that no test proved; TI06's Verify should name it too. The other renames `offers`/`data-testid="offer"` to `activeListings`/`listing`, per the glossary's "Erbjudande – aldrig i kod". Notes, routing Note:
  - N1: the security lens has not run on this change.
  - N2: concurrent approves leave a dangling authorization; carried to S05's Discovered Requirements.
  - N3: the simulated SMS page shows any number's inloggningskod; carried to S02's Discovered Requirements.
  - N4: sessions have no expiry or `secure` flag.
  - N5: the köp page's "Butikskontrollen godkände inte kortet" note also shows while a check is in progress elsewhere (an interim state S05 replaces).
