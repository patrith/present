# S06: Avslut, reklamation och tvist

**Plan**: docs/specs/applikation-for-kop-och-salj-av/plan.json
**Story-ID**: S06

## Feature Overview and Goal

**Intent**: Close the trust loop after leverans – the säljare is paid exactly once when the köp is settled, and a köpare whose presentkortskod does not work has a protected way to object that a person decides – so neither side carries the risk that a saldo check before leverans cannot remove.

**Expected Outcomes**:

- [OC01] A levererat köp becomes Avslutat by the köpare's bekräftelse, by the reklamationsperiod lapsing, or by a rejected tvist, and the säljare's utbetalningssaldo – shown marked "Simulerad utbetalning" – is credited with the köp's belopp exactly once.
- [OC02] Within the reklamationsperiod the köpare can reklamera with a motivering; the köp becomes Tvist and the säljare is not credited until the demoadministratör has decided.
- [OC03] The demoadministratör sees each tvist with the köpare's motivering and statushistorik, never the presentkortskod, and decides "återbetala" or "avslå" with a logged outcome.
- [OC04] Only the köp's köpare can bekräfta or reklamera, and only the demoadministratör can see and decide tvister.


## Required Context

- `docs/specs/applikation-for-kop-och-salj-av/prd.md#fr6-affärens-avslut-och-säljarens-utbetalning` – the criteria this story implements, all of them.
- `docs/specs/applikation-for-kop-och-salj-av/prd.md#fr7-reklamation-och-tvist` – the criteria this story implements, all of them.
- `docs/specs/applikation-for-kop-och-salj-av/prd.md#user-flows` – flow 1's end (bekräftelse, säljaren ser sitt saldo) and flow 5.
- `docs/specs/applikation-for-kop-och-salj-av/prd.md#edge-cases` – felscenario 7 is this story's (scenarios S04 and S08).
- `docs/specs/applikation-for-kop-och-salj-av/s05-kopets-felvagar-och-samtidighet.md#architecture-decision` – the leverans commit point this story's reklamationsperiod starts from, and the transaction-then-adapter pattern a refund follows.
- `docs/adrs/ADR-003-atomara-statusovergangar.md#decision` – conditional UPDATE, zero rows = no-op; the basis of "kreditera en gång" and "första statusändring gäller".
- `docs/adrs/ADR-005-klocka-och-svep.md#decision` – `expireDue(now)`, its call paths and the sweep, to which this story adds a rule.
- `docs/UBIQUITOUS_LANGUAGE.md#efter-köpet` – Avslut, Reklamation, Tvist, Återbetalning, Utbetalningssaldo and their code identifiers; never write "saldo" alone for the utbetalningssaldo.
- `docs/prototype/presentkortsmarknaden.html` – `complete`, `claim`, `refund`, `reject`, `tick` and `vAdmin` hold the copy, orsak strings and Tvister view this story follows; reference, not binding.


## Acceptance Scenarios

- **S01 [OC01] Köparen bekräftar att kortet fungerade**
  - **Given** Kalle's köp of Sara's NK annons is Levererat at belopp 850 kr and Sara's utbetalningssaldo is 0 kr
  - **When** Kalle confirms "Kortet fungerade" on the köp
  - **Then** the köp is Avslutat with a statushistorik row (aktör Kalle, orsak "köparen bekräftade"), Sara's utbetalningssaldo is 850 kr, the annons stays Såld, and Kalle still sees the presentkortskod

- **S02 [OC01] Reklamationsperioden löper ut utan reklamation**
  - **Given** Kalle's köp was Levererat at 12:00 with the configured reklamationsperiod 24 h, and nobody opens any page
  - **When** the clock passes 12:00 the next day
  - **Then** within the sweep interval the köp is Avslutat with aktör system and orsak "reklamationsperioden löpte ut", and Sara's utbetalningssaldo is credited 850 kr; at 11:59 the next day the köp is still Levererat

- **S03 [OC01] Avslut som utlöses flera gånger krediterar en gång**
  - **Given** Kalle's köp is Levererat at belopp 850 kr
  - **When** Kalle confirms twice in a row, and in a second case confirms at the same instant as the reklamationsperiod lapses
  - **Then** the köp is Avslutat with exactly one Avslutat statushistorik row, Sara's utbetalningssaldo rose by exactly 850 kr, and the losing attempt shows the köp's current status instead of an error page

- **S04 [OC02] Reklamation ger Tvist och fryser utbetalningen (felscenario 7)**
  - **Given** Kalle's köp is Levererat and inside the reklamationsperiod
  - **When** Kalle reports that the code does not work with motivering "Kassan sa att koden redan är använd"
  - **Then** the köp is Tvist with the motivering stored and a statushistorik row (aktör Kalle, orsak "köparen reklamerade"), Kalle sees that the utbetalning to the säljare is frozen until the demoadministratör decides, Kalle still sees the presentkortskod, no återbetalning happens, and Sara's utbetalningssaldo is unchanged even after the reklamationsperiod has passed

- **S05 [OC02] Reklamation nekas**
  - **Given** Kalle's köp
  - **When** Kalle reklamerar without a motivering while it is Levererat, or with a motivering while it is Avslutat, Tvist or Återbetalat (including a reklamation after the reklamationsperiod has lapsed)
  - **Then** the reklamation is refused with a message – asking for a motivering, or saying the köp cannot be reklamerat in its current status – and the köp, its statushistorik and Sara's utbetalningssaldo are unchanged

- **S06 [OC02] Samtidig reklamation och periodutgång – första gäller**
  - **Given** Kalle's köp is Levererat and its reklamationsperiod lapses at this instant
  - **When** Kalle's reklamation and the period expiry run at the same time
  - **Then** exactly one holds: either the köp is Tvist and Sara is not credited, or the köp is Avslutat, Sara is credited once and the reklamation is refused – never parts of both

- **S07 [OC03] Demoadministratören granskar en tvist utan kod**
  - **Given** Kalle's köp is Tvist and the demoadministratör is logged in
  - **When** the demoadministratör opens Tvister
  - **Then** the tvist shows handlare, belopp, köpare, säljare, Kalle's motivering and the köp's statushistorik with tidpunkt, aktör and orsak, and no page or response the demoadministratör receives contains the presentkortskod; with no open tvister the view says "Inga öppna tvister."

- **S08 [OC03] Beslut "återbetala"**
  - **Given** Kalle's köp at belopp 850 kr is Tvist
  - **When** the demoadministratör decides "återbetala"
  - **Then** the köp is Återbetalat with the decision stored and a statushistorik row (aktör demoadministratören, orsak "administratören beviljade reklamationen"), exactly one simulated återbetalning of 850 kr is made, the annons stays Såld, Sara is not credited, and Kalle sees the köp marked "Simulerad återbetalning" with belopp 850 kr and no presentkortskod

- **S09 [OC01,OC03] Beslut "avslå"**
  - **Given** Kalle's köp at belopp 850 kr is Tvist
  - **When** the demoadministratör decides "avslå", and then decides again on the same tvist
  - **Then** the köp is Avslutat with the decision stored and a statushistorik row (aktör demoadministratören, orsak "administratören avslog reklamationen"), Sara's utbetalningssaldo rose by exactly 850 kr, and the second decision is refused as already decided and changes nothing

- **S10 [OC04] Endast rätt aktör**
  - **Given** Kalle's köp of Sara's annons is Levererat, and a second köp is Tvist
  - **When** Sara or Lisa tries to bekräfta or reklamera Kalle's köp, and Kalle, Sara or Lisa tries to open Tvister or decide the tvist
  - **Then** each attempt is refused, no status, statushistorik or utbetalningssaldo changes, and only the demoadministratör's navigation shows Tvister

- **S11 [OC01,OC02,OC03] [runtime] Avslut och tvist i gränssnittet**
  - **Given** the app started with README's start command and Kalle holding a Levererat köp of Sara's NK annons at 850 kr
  - **When** Kalle confirms "Kortet fungerade" and Sara opens "mina kort"; and for a second köp Kalle reklamerar with a motivering, then the demoadministratör logs in, opens Tvister and decides "återbetala"
  - **Then** Sara sees the annons Såld and her utbetalningssaldo 850 kr inside an element labelled "Simulerad utbetalning"; the demoadministratör sees the motivering without the presentkortskod; Kalle sees the second köp Återbetalat marked "Simulerad återbetalning" and no code
  - **Proof**: `e2e/after-delivery.spec.ts#buyer confirms and seller sees simulated payout` and `e2e/after-delivery.spec.ts#claim becomes dispute and admin refunds` – red at spec time


## Structural Criteria

- **SC01** The allowed-transitions table gains exactly this story's köp transitions – Levererat→Avslutat, Levererat→Tvist, Tvist→Återbetalat, Tvist→Avslutat – and every status change this story adds goes through `transition`.
- **SC02** The utbetalningssaldo is written in exactly one place: inside the same transaction as a köp's transition to Avslutat, and only when that transition changed one row.
- **SC03** `expireDue(now)` stays idempotent with the reklamationsperiod rule added: a second call with the same `now` changes no row, credits nothing and writes no statushistorik.
- **SC04** No adapter call (refund included) runs inside a database transaction, and no new code reads system time outside the Clock module.
- **SC05** Every screen this story adds or changes – köp page actions, mina kort's utbetalningssaldo, Tvister – has no horizontal scroll at 360 px width (PRD NFR Usability).


## Scope & Boundaries

### Work Areas
- `src/domain/` – allowed-transitions table, completion with credit, reklamation, tvist decisions, the reklamationsperiod rule in `expireDue`, the authorized presentkortskod function
- `src/db/` – köp leverans tidpunkt if the schema lacks it
- `src/app/` – köp page (bekräfta, reklamera, Tvist and Återbetalat states), mina kort's utbetalningssaldo, the Tvister page and its navigation entry for the demoadministratör
- `tests/purchases/`, `tests/disputes/`, `tests/domain/`, `e2e/after-delivery.spec.ts`

### What We're NOT Doing
- Statushistorik view in mina kort, orsak per status, empty states and the full mina kort lists – story S08; this story adds only the utbetalningssaldo and the köp page's actions.
- The demo panel moving the clock to show the reklamationsperiod lapse – story S08; the rule here runs on the sweep and before reads and changes.
- Giltighetsdatum and annons utgång – story S07; a Såld annons is untouched by it.
- Partial återbetalning, fees, a payout to a bank, or a seller response in the tvist – PRD Out of Scope (riktig utbetalning, avgifter) and FR7's two decisions only.
- Automatic återbetalning on reklamation – FR7 Description: "Ingen automatisk återbetalning sker".
- PRD Edge Cases table rows: none concerns the köp after leverans; they are stories S03, S05 and S07's (narrowing note for the Edge-Cases binding constraint).


## Architecture Decision

**Approach**: Each settling action is one conditional transition from the köp's prior status – Levererat for bekräftelse, reklamation and period expiry; Tvist for both decisions – so whichever commits first wins and every repeat changes zero rows (ADR-003); the credit to the säljare lives inside the transition to Avslutat, and the simulated refund follows the Återbetalat commit, as story S05's void follows a failure commit.
**Why this over the floor**: the floor is story S05's state (köp ends at Levererat); FR6 and FR7 require avslut, credit and tvist, and FR6's "kreditera endast en gång" plus FR7's "första statusändring gäller" rule out crediting or deciding outside the conditional transition.


## Constraints & Gotchas

- **Constraint**: Bekräftelse, reklamation and decisions can arrive twice (double submit, retried server action) or race the sweep. – Workaround: a zero-row transition returns the köp's current status to the caller, as story S05 does for its callbacks; only a refused rule (wrong actor, missing motivering, disallowed status) shows an error message.
- **Constraint**: `expireDue` must run before reklamation and bekräftelse, or a köp past its reklamationsperiod could still be reklamerat until the next sweep tick. – Workaround: call it first in both actions and in the Tvister page, as story S05's TI09 does for its paths.


## Implementation Plan

### Implementation Tasks

- **TI01** The allowed-transitions table holds SC01's four transitions, and one completion function moves a köp to Avslutat and credits the annons's säljare with the köp's belopp in the same transaction, crediting nothing when the transition changes zero rows.
  - Pattern: `src/domain/transition.ts#transition` and its table from story S01.
  - **Verify**: `tests/domain/transition.test.ts#after-delivery transitions are allowed and others still refused` – the four pairs succeed once, a repeat changes nothing, an unlisted pair (e.g. Återbetalat→Avslutat, Avslutat→Tvist) is refused; plus `tests/purchases/completion.test.ts#completion credits once and rolls back with the transition` – two completions credit once, and a failing history insert leaves both status and utbetalningssaldo unchanged
  - **SATISFIES**: SC01, SC02

- **TI02** A köp carries its leverans tidpunkt, set in story S05's leverans commit point, and the authorized presentkortskod function returns the code to the köpare in Levererat, Avslutat and Tvist only – never in Återbetalat and never to the demoadministratör.
  - **Verify**: `tests/purchases/code-access.test.ts#buyer sees code until refunded and admin never` – per status asserts the köpare's access, and the demoadministratör refused in every status
  - **SATISFIES**: S01, S04, S07, S08

- **TI03** The köpare confirms a Levererat köp to Avslutat through TI01's completion function (orsak "köparen bekräftade"); anyone else is refused, and a repeat returns the current status.
  - Depends on TI01.
  - **Verify**: `tests/purchases/completion.test.ts#buyer confirmation completes and credits once` – asserts status, history row with aktör and orsak, utbetalningssaldo +850, annons Såld, a second confirm leaving one Avslutat row and +850 in total, and Sara's and Lisa's confirm refused with nothing changed
  - **SATISFIES**: S01, S03, S10

- **TI04** `expireDue(now)` gains a rule completing every Levererat köp whose leverans tidpunkt + the configured reklamationsperiod is at or before `now`, through TI01's completion function (aktör system, orsak "reklamationsperioden löpte ut"); Tvist köp are never touched.
  - Depends on TI01, TI02. Pattern: story S05's reservation rule in `src/domain/expire-due.ts`.
  - **Verify**: `tests/domain/expire-due.test.ts#claim period lapse completes and credits once` – fixed Clock: unchanged at leverans + 24 h − 1 min, Avslutat and +850 at + 24 h, a second call writing nothing, a Tvist köp unchanged and uncredited; `Promise.all` of a confirm and `expireDue` at the boundary, 20 rounds, credits exactly once each
  - **SATISFIES**: S02, S03, SC03

- **TI05** The köpare reklamerar a Levererat köp with a non-empty motivering: `expireDue` runs first, then the köp goes to Tvist with the motivering stored (orsak "köparen reklamerade") and no credit; a missing motivering, a status other than Levererat, or another actor is refused.
  - Depends on TI01, TI04.
  - **Verify**: `tests/purchases/claim.test.ts#claim opens dispute and refusals change nothing` – asserts Tvist, motivering, history row, no refund call, utbetalningssaldo unchanged after a later `expireDue` past the period; each refusal (empty motivering; Avslutat, Tvist, Återbetalat; past the period; Sara; Lisa) leaves status, history count and utbetalningssaldo unchanged
  - **SATISFIES**: S04, S05, S10

- **TI06** A reklamation and the period expiry racing at the same instant end in exactly one of scenario S06's two outcomes.
  - Depends on TI04, TI05.
  - **Verify**: `tests/purchases/claim-race.test.ts#claim and claim-period expiry never both apply` – 20 rounds of `Promise.all([claim, expireDue(t)])` with the Clock at the period's end; each round asserts either Tvist with no credit or Avslutat with one credit and the reklamation refused
  - **SATISFIES**: S06

- **TI07** The demoadministratör's decisions: "återbetala" moves Tvist→Återbetalat (decision stored, orsak "administratören beviljade reklamationen") and, after commit, refunds through `PaymentProvider.refund` once; "avslå" completes through TI01's function (orsak "administratören avslog reklamationen"); a second decision or a decision by anyone else is refused.
  - Depends on TI01.
  - **Verify**: `tests/disputes/decide.test.ts#refund and reject each settle once and only for the admin` – asserts statuses, stored decision, history rows with aktör and orsak, exactly one refund call for 850 kr and the annons Såld on refund, +850 once on reject, zero credit on refund, a repeated decision (sequential and `Promise.all`) changing nothing, and Kalle's, Sara's and Lisa's decisions refused
  - **SATISFIES**: S08, S09, S10

- **TI08** A Tvister page, linked in the navigation only for the demoadministratör, lists every Tvist köp with handlare, belopp, köpare, säljare, motivering, statushistorik and the two decision buttons, from a DTO without the presentkortskod; anyone else is refused.
  - Depends on TI07. Pattern: story S01's code-free DTO for sökning.
  - **Verify**: `tests/disputes/admin-view.test.ts#admin sees motivation and history but never the code` – serializes the page data and asserts the motivering, every history row, and the code string absent; empty list yields "Inga öppna tvister."; Kalle, Sara and Lisa refused
  - **SATISFIES**: S07, S10

- **TI09** The köp page offers the köpare "Kortet fungerade" and "Rapportera fel" (with a motivering field) while Levererat, shows the frozen-utbetalning note while Tvist and "Simulerad återbetalning" with belopp while Återbetalat; mina kort shows the säljare's utbetalningssaldo inside an element labelled "Simulerad utbetalning".
  - Depends on TI03, TI05, TI07.
  - **Verify**: `tests/my-cards/my-cards.test.ts#seller sees payout balance` – Sara's mina kort data carries 850 after a completion and 0 before; plus `tests/purchases/purchase-page.test.ts#buyer actions and notes follow the köp status` – the köp page data offers both actions only to the köpare while Levererat, carries the frozen-utbetalning note while Tvist, and "Simulerad återbetalning" with belopp 850 kr while Återbetalat
  - **SATISFIES**: S01, S04, S08

- **TI10** Playwright drives scenario S11 at a 360×800 viewport against the app started by `dev`, recording every response the demoadministratör receives.
  - Depends on TI08, TI09.
  - **Verify**: `e2e/after-delivery.spec.ts#buyer confirms and seller sees simulated payout` and `e2e/after-delivery.spec.ts#claim becomes dispute and admin refunds` – scenario S11's outcomes, no recorded admin response containing the presentkortskod, and `scrollWidth <= clientWidth` on the köp page, mina kort and Tvister
  - **SATISFIES**: S11, SC05

- **TI11** No adapter call sits inside a transaction callback, the utbetalningssaldo is written only in the completion function, and no new system-time read exists.
  - **Verify**: `cmd: test -z "$(git grep -nE 'Date\.now\(|new Date\(\)' -- src ':!src/domain/clock.ts')"` – no system-time read outside the Clock module; plus `inspect: src/domain/purchases.ts` – `refund` outside every `db.transaction(...)` callback, and the only write to the utbetalningssaldo column is inside the completion function's transaction
  - **SATISFIES**: SC02, SC04


## Settled Decisions

- The reklamationsperiod runs from the leverans commit tidpunkt, and a reklamation is allowed while now < leverans + period, with expiry at now ≥ leverans + period (as the prototype's `tick`).
- The köpare keeps seeing the presentkortskod in Avslutat and Tvist and loses it only in Återbetalat (FR9's list), so this story changes the authorized code function's rule.
- Orsak texts and copy follow the prototype ("köparen bekräftade", "reklamationsperioden löpte ut", "köparen reklamerade", "administratören beviljade reklamationen", "administratören avslog reklamationen", "Kortet fungerade", "Rapportera fel", "Inga öppna tvister.").
- The återbetalning is labelled "Simulerad återbetalning" on the köpare's Återbetalat view, satisfying FR10's "återbetalning" item.
- A reklamation needs a non-empty motivering, since FR7 says "med en motivering".
- Bekräftelse of a köp that is not Levererat (Tvist, Avslutat, Återbetalat) is refused as a disallowed transition and shows the current status.
- The leverans tidpunkt is a köp column set in story S05's commit-point transaction when story S01's schema lacks one.


## Discovered Requirements

- **Title**: Join S05's `expireDue` rule shape and request-scoped deps
  - **Description**: A rule in `expiryRules` (`src/domain/expire-due.ts`) is `(deps, now) => AfterCommit[]`: it makes its database transitions synchronously and returns the adapter calls (void, refund) to run after commit. The reklamationsperiod rule follows that shape. New server actions and pages that read or change köp use `getCurrentDeps()` (`src/server/deps.ts`), which runs `expireDue` first; this is the "call it first" path TI05 and the Constraint name. `PurchaseView` already carries `failureReason`; amounts format with `kronor` from `src/domain/money.ts`.
  - **Rationale**: The FIS was written before S05 fixed the rule signature and the deps entry point.
  - **Interpretation**: Use these as they are; add no second expiry entry point or second money formatter.
  - **Traced from**: S05/TI07, S05/TI09
  - **Date**: 2026-11-17


## Implementation Observations

- The completion function lives in its own module, `src/domain/completion.ts` (`completePurchaseTx`), not in `src/domain/purchases.ts`: `expire-due.ts` imports it, and `purchases.ts` imports `expireDue`, so placing it in `purchases.ts` would create an import cycle (the same reason S05 put `failPurchaseTx` in `purchase-failure.ts`). TI11's `inspect: src/domain/purchases.ts` therefore holds for `refund` (after the `transition` commit in `decideDispute`), while the single utbetalningssaldo write is in `completion.ts`.
- Bekräftelse of a köp no longer Levererat returns `{ kind: "unchanged", status }` and the action redirects to the köp page (S03's "shows the köp's current status"); only wrong actor is an error. Reklamation outside Levererat and a repeated decision throw `wrong_purchase_status` with a message, as S05/S09 require.
- `getPurchasePage` (köp page data) and `getDisputesPage` (Tvister data with the "Inga öppna tvister." empty text) are the units TI08/TI09's tests read. Tvister refuses non-admins with `forbidden`; the page maps it to 404, like the köp page does for non-köpare.
- `giftCardCodeFor` now refuses the demoadministratör explicitly (role check), and `BUYER_CODE_STATUSES` is exported so `toView` gates per köp status (a köpare's earlier Misslyckat köp of the same annons never shows the code).
- The claim period's sweep rule returns no after-commit calls; the refund is the only new adapter call and runs in `decideDispute` after the Återbetalat commit.
- Existing test assertions touched, setup/inventory only: `tests/my-cards/my-cards.test.ts` (Lisa's mina kort `toEqual` gains `payoutBalance: 0` for the new MyCards field; the scenario "third user sees neither" is unchanged) and `tests/auth/actions.test.ts` (action inventory gains `confirmPurchaseAction`, `claimPurchaseAction`, `decideDisputeAction`, each still refused without a session).
- Tidy: `src/app/globals.css` `.field textarea` joins the `.field input, .field select` rule so the motivering field matches the other fields.
- Review notes (Routing: Note): the köp page's "Klart! Visa koden i kassan." note also shows on a Tvist köp next to the frozen-utbetalning note – per-status copy belongs to S08 (`src/app/kop/[id]/page.tsx`); `decideDispute` on a köp never in Tvist says "Tvisten är redan avgjord." (`src/domain/purchases.ts`); a failing `payments.refund` after the Återbetalat commit surfaces as an error page with no retry, matching S05's capture-after-commit pattern; the motivering has no max length.
- NOTICED BUT NOT TOUCHING: `e2e/helpers.ts` `phones` lacks the demoadministratör, so `e2e/after-delivery.spec.ts` keeps its own `ADMIN_PHONE`; S08 may want it in the shared helper.
- Reconciled with S07 (merge of the base after S07 landed): `expire-due.ts` keeps S07's load-bearing order `[expireReservedPastValidity, expireReservations, expirePastValidity]` and appends `completeLapsedClaimPeriods` last (it touches only Levererat köp, so it is independent of the giltighet rules); both imports (`completePurchaseTx`, `isDomainError`) kept. `my-cards.ts` keeps S07's `MyListing` with `expiryReason` and S06's `payoutBalance`. `purchases.ts`: only the import line conflicted (`users` for S06, `isPastValidity` for S07); S07's `deliverPurchase` giltighet check and S06's settle/claim/dispute functions and `toView` code gate merged cleanly. `transition.test.ts` and `my-cards.test.ts` keep both stories' new tests unchanged – S06's added pairs are all `purchase`, S07's all `listing`, so neither story's refused list or "nothing else is added" assertion needed changes.
