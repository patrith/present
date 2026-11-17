# S05: Köpets felvägar och samtidighet

**Plan**: docs/specs/applikation-for-kop-och-salj-av/plan.json
**Story-ID**: S05

## Feature Overview and Goal

**Intent**: Make a köp safe when things go wrong – a race, a declined payment, a failing butikskontroll, a lapsed reservation, a repeated betalningsbesked – so a buyer never pays for a code they do not get and an annons is never sold twice.

**Expected Outcomes**:

- [OC01] At most one köpare ever holds the reservation of an annons, and a refused attempt to start a köp tells the buyer why.
- [OC02] When the payment is declined or the butikskontroll at köp does not answer giltig with the full saldo, nothing is drawn, no presentkortskod is delivered, the köp ends Misslyckat and the annons returns to Aktiv or becomes Flaggad by cause.
- [OC03] A repeated or late answer – a duplicated betalningsbesked, a verifier reply after the timeout, a besked meeting reservation expiry – never yields a second dragning, a second leverans, or both a leverans and a failure.
- [OC04] A reservation that lapses before leverans releases the annons and fails the köp even when nobody is looking.


## Required Context

- `docs/specs/applikation-for-kop-och-salj-av/prd.md#fr5-köp-med-reservation-auktorisering-och-leverans` – the criteria this story completes (2 and 5–11; story S01 built 1, 3, 4).
- `docs/specs/applikation-for-kop-och-salj-av/prd.md#edge-cases` – felscenario 1, 2, 4, 5 and the köp rows of the table, each mapped to a scenario below.
- `docs/specs/applikation-for-kop-och-salj-av/s01-walking-skeleton-for-demoflodet.md#architecture-decision` – the köp Flow this story extends; it already commits leverans before dragning.
- `docs/adrs/ADR-003-atomara-statusovergangar.md#decision` – conditional UPDATE, zero rows = no-op, history in the same transaction.
- `docs/adrs/ADR-005-klocka-och-svep.md#decision` – `expireDue(now)`, its three call paths, the `globalThis` guard on the sweep.
- `docs/prototype/presentkortsmarknaden.html` – `failPurchase`, `pay` and `tick` hold the orsak strings and failure mapping this story follows; copy reference, not binding.


## Acceptance Scenarios

- **S01 [OC01] [runtime] Två samtidiga köp – exakt en reservation**
  - **Given** Sara's Aktiv annons and Kalle and Lisa logged in in separate browser sessions
  - **When** both press Köp on the annons at the same moment
  - **Then** exactly one köp with status Påbörjat exists and the annons is Reserverad for that köpare; the other sees "Annonsen är redan reserverad eller inte längre tillgänglig." and no köp is created for them
  - **Proof**: `e2e/purchase-failures.spec.ts#two buyers at once get exactly one reservation` – red at spec time

- **S02 [OC01] Samma köpare i två flikar**
  - **Given** Kalle's köp of an annons is Påbörjat
  - **When** Kalle starts a köp of the same annons again from a second tab
  - **Then** no second köp or reservation is created and Kalle is shown his ongoing köp with its current status

- **S03 [OC01] Säljaren kan inte köpa sin egen annons**
  - **Given** Sara's Aktiv annons, reached by its direct address
  - **When** Sara starts a köp of it
  - **Then** the köp is refused with a message that you cannot buy your own annons, no köp exists and the annons stays Aktiv

- **S04 [OC02] Nekad betalning (felscenario 2)**
  - **Given** Kalle's köp is Påbörjat
  - **When** Kalle chooses "Neka betalningen" in the step marked "Simulerad betalning"
  - **Then** the köp is Misslyckat with orsak "betalningen nekades", the annons is Aktiv again and back in sökningen, no dragning is made, Kalle sees no presentkortskod, and both changes have statushistorik rows with aktör and orsak; Lisa's attempt to decline or approve Kalle's köp is refused and changes nothing (story S01 SC06)

- **S05 [OC02] Kontrollen vid köp svarar ogiltig**
  - **Given** an Aktiv annons whose presentkortskod starts with `ANVAND`
  - **When** Kalle buys it and approves the payment
  - **Then** the authorization is released (void), no dragning is made, the köp is Misslyckat with orsak "butiken godkände inte koden", the annons is Flaggad with flaggningsorsak "ogiltig kod" and absent from sökningen, and Kalle sees no presentkortskod

- **S06 [OC02] Kontrollen vid köp anger lägre saldo (felscenario 4)**
  - **Given** an Aktiv annons with saldo 1 000 kr whose presentkortskod starts with `DELVIS` (800 kr at köp)
  - **When** Kalle buys it and approves the payment
  - **Then** the authorization is released, no dragning is made, the köp is Misslyckat, the annons is Flaggad with flaggningsorsak "saldoavvikelse", and Kalle is told that the butik reports 800 kr instead of the advertised 1 000 kr and that no money was drawn

- **S07 [OC02] Kontrollen vid köp svarar inte eller svarar med fel**
  - **Given** an Aktiv annons whose presentkortskod starts with `TIMEOUT`, and another starting with `FEL`
  - **When** Kalle buys each and approves the payment
  - **Then** for each, the authorization is released, no dragning is made, the köp is Misslyckat with orsak "butikskontrollen svarade inte" or "butikskontrollen svarade med fel" respectively, and the annons is Aktiv again

- **S08 [OC03] Sent svar efter tidsgränsen ignoreras**
  - **Given** a butikskontroll that answers giltig only after the configured verifier timeout (5 s) has passed
  - **When** Kalle approves the payment and the timeout expires before the answer
  - **Then** the köp is Misslyckat with orsak "butikskontrollen svarade inte" and the annons Aktiv at the timeout, and the late giltig answer causes no dragning, no leverans and no further status change

- **S09 [OC03] Dubblerat betalningsbesked (felscenario 5)**
  - **Given** Kalle's köp is Påbörjat for a code the butikskontroll answers giltig
  - **When** the same approving betalningsbesked is received twice, both one after the other and both at once
  - **Then** the köp is Levererat and the annons Såld, exactly one dragning is made for the authorization, the statushistorik holds exactly one row each for Betalning auktoriserad, Levererat and Såld, and the second besked returns the köp's current status

- **S10 [OC04] Reservationen löper ut före leverans**
  - **Given** Kalle's köp is Påbörjat, and in a second case Betalning auktoriserad, with the reservation running until 12:05
  - **When** the clock passes 12:05 and nobody opens any page
  - **Then** within the sweep interval the köp is Misslyckat with orsak "reservationen gick ut" and aktör system, the annons is Aktiv and listed in sökningen again, and in the authorized case the authorization is released
  - **And When** Kalle approves the payment after 12:05
  - **Then** no authorization is kept, no dragning or leverans happens, and Kalle sees that the reservation has expired

- **S11 [OC03] Reservationen löper ut exakt när betalningsbeskedet kommer**
  - **Given** Kalle's köp is Betalning auktoriserad, the butikskontroll has answered giltig, and the reservation lapses at that same instant
  - **When** expiry and leverans run concurrently
  - **Then** exactly one outcome holds: either the köp is Levererat, the annons Såld and one dragning made; or the köp is Misslyckat, the annons Aktiv, the authorization released and no dragning made – never parts of both

- **S12 [OC02] [runtime] Felvägar syns i gränssnittet**
  - **Given** the app started with README's start command
  - **When** Kalle declines in the "Simulerad betalning" step, and in a second köp approves for a `DELVIS` code
  - **Then** Kalle sees the declined köp as Misslyckat and the saldoavvikelse explanation, no page shows a presentkortskod, and the annons of the declined köp is in sökningen again
  - **Proof**: `e2e/purchase-failures.spec.ts#declined payment and lower balance are explained` – red at spec time


## Structural Criteria

- **SC01** The allowed-transitions table gains exactly this story's FR5 transitions – annons Reserverad→Aktiv and Reserverad→Flaggad; köp Påbörjat→Misslyckat and Betalning auktoriserad→Misslyckat – and every status change this story adds goes through `transition`.
- **SC02** `expireDue(now)` is idempotent: a second call with the same `now` changes no row and writes no statushistorik.
- **SC03** No code outside the Clock module reads system time, the verifier timeout and the sweep included (story S01's SC02, which this diff could break).
- **SC04** No adapter call (authorize, capture, void, verify) runs inside a database transaction.


## Scope & Boundaries

### Work Areas
- `src/domain/` – allowed-transitions table, purchases (reserve, payment callback, verifier outcome handling, commit point), `expireDue` and its reservation rule, config (verifier timeout)
- `src/instrumentation.ts` and the sweep starter
- `src/app/` – köp and payment-step pages (decline control, failure messages), the expireDue call before reads and changes in sökning, annons, köp and mina kort
- `tests/purchases/`, `tests/domain/`, `e2e/purchase-failures.spec.ts`

### What We're NOT Doing
- Giltighetsdatum passing during a köp ("kortet har gått ut", Reserverad→Utgången) and the giltighet check at leverans – story S07 adds that rule to `expireDue`.
- Reklamationsperiodens utgång and anything after Levererat – story S06.
- The demo panel moving the clock and calling `expireDue` on move – story S08; this story only exposes `expireDue` for it.
- Showing orsak and statushistorik in mina kort – story S08; this story stores orsak and shows the outcome on the köp page only.
- Rättning of a Flaggad annons – story S03.
- A real 5 s sleep in the `TIMEOUT` simulator row – story S01 keeps it immediate; the late-answer case uses a slow verifier double (scenario S08).
- Worker-thread or multi-process concurrency tests – the app is one Node process on one SQLite file (ADR-002); an in-process race plus two real browser sessions prove the conditional UPDATE at this stage (`flagged: exceeds stage prototype in docs/PRODUCT.md` for anything more).


## Architecture Decision

**Approach**: Every failure path is a pair of conditional transitions (köp →Misslyckat, annons →Aktiv/Flaggad) in one transaction, followed after commit by an idempotent void; leverans gets a single commit point – one transaction, conditional on köp Betalning auktoriserad and `reserved_until > now`, that moves köp →Levererat and annons →Såld – and dragning runs after that commit, before the code is returned. Expiry's transaction is conditional on köp Påbörjat or Betalning auktoriserad, so whichever commits first wins and the other changes zero rows.
**Why this over the floor**: the floor is story S01's flow (capture, then transitions); FR5's "aldrig båda" edge case rules it out, because an expiry between capture and the delivery transaction would leave money drawn on a failed köp.
**Flow**: reserve (refuse own annons; conditional Aktiv→Reserverad) → payment step: decline → fail(Aktiv); approve → authorize → conditional Påbörjat→Betalning auktoriserad (zero rows = duplicate or expired besked: return current status, void a fresh authorization) → verify, raced against the verifier timeout → giltig with saldo ≥ annons saldo: commit point → capture → code page; ogiltig → fail(Flaggad, "ogiltig kod"); lower saldo → fail(Flaggad, "saldoavvikelse"); timeout or fel → fail(Aktiv). fail(...) = transaction, then void.


## Constraints & Gotchas

- **Constraint**: The verifier promise keeps running after the timeout wins the race. – Workaround: the code after the race acts only on the race's winner, and every write it makes is a conditional transition, so a late answer finds the köp already Misslyckat and changes nothing.
- **Constraint**: `expireDue` and the sweep share the `globalThis` handles from story S01; hot reload must not start a second interval. – Workaround: guard the interval with a `globalThis` flag and start it only when `process.env.NEXT_RUNTIME === "nodejs"`.
- **Constraint**: The same reserve or callback can arrive twice from Next.js (double submit, retried server action). – Workaround: treat a zero-row transition as "already handled" and return the current köp, never an error page.


## Implementation Plan

### Implementation Tasks

- **TI01** The allowed-transitions table holds SC01's four new transitions, and a failed köp stores its orsak and a Flaggad annons its flaggningsorsak, both in the transition's statushistorik row.
  - Pattern: `src/domain/transition.ts#transition` and its table from story S01.
  - **Verify**: `tests/domain/transition.test.ts#purchase failure transitions are allowed and others still refused` – asserts the four pairs succeed once, a repeat changes nothing, and an unlisted pair (e.g. Misslyckat→Aktiv) is refused
  - **SATISFIES**: SC01

- **TI02** Starting a köp refuses the annons's säljare, refuses an annons that is not Aktiv with "Annonsen är redan reserverad eller inte längre tillgänglig.", and returns the caller's own ongoing köp instead of creating a second one.
  - **Verify**: `tests/purchases/reserve.test.ts#concurrent, repeated and own-listing reservations` – 20 rounds of two `Promise.all` reservations by different buyers each yield exactly one Påbörjat köp and one refusal with that message; a repeat by the same buyer returns the same köp id; the säljare's attempt creates no köp and leaves the annons Aktiv
  - **SATISFIES**: S01, S02, S03

- **TI03** The payment step offers "Godkänn" and "Neka betalningen"; a decline fails the köp with orsak "betalningen nekades" and returns the annons to Aktiv without any dragning; only the köp's köpare can decline, as story S01 SC06 requires of the step.
  - **Verify**: `tests/purchases/payment.test.ts#declined payment fails purchase and reactivates listing` – asserts statuses, orsak, history rows with aktör, zero captures, and the annons in the sökning result; plus `tests/purchases/payment.test.ts#another user cannot decline the buyers purchase`
  - **SATISFIES**: S04

- **TI04** Each non-giltig butikskontroll outcome at köp maps to the failure of scenarios S05–S07 – void after the transaction, köp orsak, annons status and flaggningsorsak – and the lower-saldo outcome returns the reported and advertised saldo for the buyer's explanation.
  - Depends on TI01.
  - **Verify**: `tests/purchases/verifier-outcomes.test.ts#ANVAND DELVIS TIMEOUT FEL each fail without capture` – per prefix asserts köp Misslyckat with its orsak, annons status and flaggningsorsak, one void, zero captures, no code from the code function, and for `DELVIS` the 800/1 000 kr pair in the result
  - **SATISFIES**: S05, S06, S07

- **TI05** The butikskontroll at köp is raced against a configurable verifier timeout (default 5 s, environment-overridable); on timeout the köp fails as "butikskontrollen svarade inte" and a later answer changes nothing.
  - Depends on TI04.
  - **Verify**: `tests/purchases/verifier-timeout.test.ts#late giltig answer after timeout is ignored` – timeout 50 ms, a verifier double answering giltig after 200 ms; asserts the failure at the timeout and, after the answer has resolved, still Misslyckat/Aktiv, zero captures, unchanged history count; plus `cmd: test -z "$(git grep -nE 'Date\.now\(|new Date\(\)' -- src ':!src/domain/clock.ts')"` – no system-time read outside the Clock module, the timeout and the sweep included
  - **SATISFIES**: S08, SC03

- **TI06** Leverans uses the Architecture Decision's commit point, dragning follows the commit, and a betalningsbesked whose Påbörjat→Betalning auktoriserad transition changes zero rows returns the current köp without verifying, capturing or delivering.
  - Depends on TI01.
  - **Verify**: `tests/purchases/payment-callback.test.ts#duplicate besked sequential and concurrent capture once` – asserts Levererat/Såld, exactly one capture, exactly one history row each for Betalning auktoriserad, Levererat and Såld, for both orderings
  - **SATISFIES**: S09

- **TI07** `expireDue(now)` holds an ordered list of rules with reservation expiry as the first: each annons Reserverad past `reserved_until` with a köp not yet Levererat fails that köp ("reservationen gick ut", aktör system), reactivates the annons, then voids any authorization; a besked for an already failed köp keeps no authorization.
  - Depends on TI01, TI06.
  - **Verify**: `tests/domain/expire-due.test.ts#reservation expiry fails purchase reactivates listing and is idempotent` – fixed Clock at 12:05:01 for köp in Påbörjat and in Betalning auktoriserad; asserts statuses, orsak, one void only in the authorized case, a second call writing nothing, and an approval after expiry leaving zero kept authorizations and zero captures
  - **SATISFIES**: S10, SC02

- **TI08** Expiry and leverans racing at the same instant end in exactly one of scenario S11's two outcomes.
  - Depends on TI06, TI07.
  - **Verify**: `tests/purchases/expiry-race.test.ts#expiry and delivery never both apply` – 20 rounds of `Promise.all([expireDue(t), deliver])` with the Clock at `reserved_until`; each round asserts one consistent outcome set (statuses, capture count, void count) and never a capture on a Misslyckat köp
  - **SATISFIES**: S11, SC04

- **TI09** `expireDue(clock.now())` runs before every read or change of annonser and köp – sökning, annons view, reserve, payment callback, köp page, mina kort – and a sweep started once from `src/instrumentation.ts` calls it every second.
  - Depends on TI07.
  - **Verify**: `tests/domain/sweep.test.ts#sweep expires a reservation without any read and starts once` – registering twice starts one interval; with the movable Clock past `reserved_until` and no read, the annons is Aktiv after one tick; plus `tests/listings/search.test.ts#expired reservation is listed again` – sökning lists the annons after expiry without a sweep tick
  - **SATISFIES**: S10

- **TI10** The köp page shows each failure's outcome to the buyer – Misslyckat with its orsak, the saldoavvikelse explanation, the expired-reservation message – and never a presentkortskod.
  - Depends on TI03, TI04, TI07.
  - **Verify**: `e2e/purchase-failures.spec.ts#declined payment and lower balance are explained` – scenario S12 at 360×800, with recorded responses free of both presentkortskoder and `scrollWidth <= clientWidth`; `e2e/purchase-failures.spec.ts#two buyers at once get exactly one reservation` – two browser contexts click Köp together; one sees the reserved page, the other the refusal message, and mina kort lists one köp in total
  - **SATISFIES**: S01, S12

- **TI11** No adapter call sits inside a database transaction callback in the purchase and expiry code.
  - **Verify**: `inspect: src/domain/purchases.ts` – every `authorize`, `capture`, `void` and `verify` call is outside `db.transaction(...)` callbacks; plus `inspect: src/domain/expire-due.ts` – the same for `expireDue`'s reservation rule (the module stories S06 and S08 name)
  - **SATISFIES**: SC04


## Settled Decisions

- Dragning runs after the leverans commit, as story S01's Flow already does, so expiry and leverans cannot both apply; the simulated capture of a valid authorization cannot fail.
- Orsak and flaggningsorsak texts follow the prototype ("betalningen nekades", "butiken godkände inte koden", "ogiltig kod", "saldoavvikelse", "butikskontrollen svarade inte", "reservationen gick ut"), adding "butikskontrollen svarade med fel" for `FEL`.
- The refusal text for an already reserved annons is the prototype's "Annonsen är redan reserverad eller inte längre tillgänglig."
- A betalningsbesked arriving after the köp failed (expiry or duplicate) releases its fresh authorization rather than keeping it.
- The verifier timeout is 5 s from config, overridable by environment variable, and tests use a short value.
- Concurrency is proved in-process with `Promise.all` plus two real browser sessions, since the app is a single Node process on one SQLite file.
- A repeat köp start by the same buyer returns their ongoing köp page instead of an error.


## Discovered Requirements

- **Title**: Two concurrent approves of the same köp must leave one authorization
  - **Description**: S01's `approvePayment` (`src/domain/purchases.ts`) checks that the köp is Påbörjat and only then awaits `PaymentProvider.authorize`. Two concurrent approves of the same köp (two tabs) both pass the check and both authorize. The second then fails its started→authorized transition with `transition_conflict`, and its authorization is never voided. `approvePaymentAction` catches only `wrong_purchase_status`, so the second tab shows "Statusen har redan ändrats." instead of the köp's current status.
  - **Rationale**: S01's FIS deferred concurrency and void to this story. The two-tab scenario here (S02) covers starting a second köp, not approving one köp twice.
  - **Interpretation**: when the losing approve's transition conflicts, void its authorization and show the köp's current status. A test runs two `approvePayment` calls concurrently and asserts exactly one capture and no authorization left in the authorized state.
  - **Traced from**: S01/TI09 (review finding N2)
  - **Date**: 2026-11-17


## Implementation Observations

- ASSUMPTION: a reservation has run out once `now >= reserved_until` (expiry rule `reserved_until <= now`, commit point `reserved_until > now`), so expiry and leverans are exact complements and at the boundary instant expiry wins deterministically, matching story S07's TI08 expectation at the giltighet end – a product decision that 12:05:00 still counts as reserved would flip both comparisons together.
- ASSUMPTION: the saldoavvikelse explanation lives in the köp's orsak (`saldoavvikelse: butiken anger 800 kr i stället för annonserade 1 000 kr`) while the annons's flaggningsorsak stays exactly `saldoavvikelse`; this needs no schema column for the reported saldo – a requirement to show the reported saldo outside the köp's orsak would add one.
- ASSUMPTION: a declined payment's statushistorik rows name the köpare as aktör (his choice in the "Simulerad betalning" step); butikskontroll outcomes and expiry name the system – the prototype names the system for all, which would change only the aktör column.
- ASSUMPTION: the expireDue call before reads and changes (TI09) sits in one server helper, `getCurrentDeps()` in `src/server/deps.ts`, used by the sökning, annons, köp and mina kort pages and the reserve and payment actions, rather than inside the pure domain read functions; `tests/listings/search.test.ts#expired reservation is listed again` proves the helper, and the pages' use of it is by inspection – moving the call into domain reads would change their signatures, which story S04 is rewriting in parallel.
- `tests/domain/transition.test.ts#conditional update writes history once and refuses repeats and unlisted transitions` (story S01) used Reserverad→Aktiv as its unlisted pair; SC01 lists that pair, so the test now uses Såld→Aktiv. The test's scenario ("unlisted transitions are refused") is unchanged.
- `tests/purchases/purchase.test.ts` (story S01) asserted `approvePayment`'s old string results `"delivered"` / `"check_failed"`; the return type is now `PaymentOutcome`, so those assertions read `{ kind: "delivered" }` / `{ kind: "failed" }` – a harness change, the scenarios are unchanged.
- `approvePayment` keeps story S01's early `wrong_purchase_status` refusal for a köp no longer Påbörjat (it avoids a needless authorization); the action layer maps it to the köp page, so a repeated approve still shows the current status rather than an error.
- The Discovered Requirement (two concurrent approves) is implemented in `receivePaymentAnswer`: a losing besked whose authorization is not the köp's stored one is voided, and the köp's current status is returned; proved by `tests/purchases/payment-callback.test.ts#two concurrent approves leave one capture and no held authorization`.
- Runtime check of the sweep in `next dev` (not a shipped test): with `RESERVATION_MINUTES=0.05`, a köp started through the browser was Misslyckat "reservationen gick ut" in the database 5 s later with no page open.
- NOTICED BUT NOT TOUCHING: `e2e/purchase-failures.spec.ts` repeats `logIn`, `publish`, `recordResponses` and `expectNoHorizontalScroll` from `e2e/demo-flow.spec.ts`; extracting an `e2e/helpers.ts` would edit story S01's spec while sibling stories may be editing it too – worth doing once S03/S04 have merged.
- NOTICED BUT NOT TOUCHING: `playwright.config.ts` fixes port 3100 with `reuseExistingServer: false`, so parallel worktrees cannot run the e2e tier at the same time; this run used a worktree-local config under `.agent_temp/` on port 3105.
- Review (quick, code + gap) – LOW, `src/domain/expire-due.ts#expireDue`: the after-commit voids run in a sequential `for … await`, so one throwing `void` skips the rest of that batch and leaves those authorizations held (their köp are already Misslyckat and never revisited); reachable only with an unknown authorization id (a persisted DB outliving a server restart, which `npm run dev` precludes). Suggested: run all voids, then rethrow the first error. | Routing: Note
- Review (quick) – LOW: `PAYMENT_DECLINED` and `RESERVATION_EXPIRED` are exported but used only in their own modules; harmless. | Routing: Note
