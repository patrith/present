# S07: Utgång av annonser

**Plan**: docs/specs/applikation-for-kop-och-salj-av/plan.json
**Story-ID**: S07

## Feature Overview and Goal

**Intent**: A buyer must never pay for a gift card that is no longer valid at the butik, so an annons has to stop being buyable the moment its giltighetsdatum ends – even mid-köp and even when nobody is looking – and the säljare must understand why it disappeared.

**Expected Outcomes**:

- [OC01] An Aktiv or Flaggad annons becomes Utgången once its giltighetsdatum has ended, Swedish time, and is no longer in sökningen or buyable.
- [OC02] A köp whose annons's giltighet ends before leverans is Misslyckat with orsak "kortet har gått ut": no dragning, no presentkortskod, the authorization released, the annons Utgången – never both delivered and expired.
- [OC03] The säljare sees in "mina kort" that the annons has gått ut and why.


## Required Context

- `docs/specs/applikation-for-kop-och-salj-av/prd.md#fr8-utgång-av-annonser` – the three criteria this story implements.
- `docs/specs/applikation-for-kop-och-salj-av/prd.md#fr5-köp-med-reservation-auktorisering-och-leverans` – criterion 4's "giltigheten inte har passerat" at leverans, which story S05 left to this story.
- `docs/specs/applikation-for-kop-och-salj-av/prd.md#edge-cases` – felscenario 3, mapped to scenarios S04–S06.
- `docs/specs/applikation-for-kop-och-salj-av/s05-kopets-felvagar-och-samtidighet.md#architecture-decision` – the leverans commit point and fail(...) pattern this story extends.
- `docs/specs/applikation-for-kop-och-salj-av/s05-kopets-felvagar-och-samtidighet.md#implementation-tasks` – TI07's `expireDue` rule list and TI09's call paths and sweep, which this story joins rather than duplicates.
- `docs/specs/applikation-for-kop-och-salj-av/s03-publicera-och-hantera-annons.md#constraints--gotchas` – the `Europe/Stockholm` date helper this story shares (see Constraints).
- `docs/adrs/ADR-003-atomara-statusovergangar.md#decision` – conditional UPDATE, zero rows = no-op, history in the same transaction.
- `docs/adrs/ADR-005-klocka-och-svep.md#decision` – `expireDue(now)` and its three call paths.
- `docs/UBIQUITOUS_LANGUAGE.md` – Giltighetsdatum (`validUntil`), Utgången (`expired`).


## Acceptance Scenarios

- **S01 [OC01] Aktiv annons går ut efter giltighetsdagens slut**
  - **Given** Sara's Aktiv annons with giltighetsdatum 2026-11-17 and the Clock at 2026-11-17 23:59:59 Swedish time
  - **When** Kalle opens sökningen, then the Clock reaches 2026-11-18 00:00:00 Swedish time and nobody opens any page
  - **Then** at 23:59:59 the annons is Aktiv and listed; within one sweep tick after midnight it is Utgången with a statushistorik row (aktör system, orsak that the giltighetsdatum has passed), absent from Kalle's sökningen, and a köp start on it is refused with story S05's not-available message and creates no köp

- **S02 [OC01] Flaggad annons går också ut**
  - **Given** Sara's Flaggad annons (flaggningsorsak saldoavvikelse) with giltighetsdatum 2026-11-17
  - **When** the Clock passes 2026-11-18 00:00:00 Swedish time
  - **Then** the annons is Utgången with its statushistorik row

- **S03 [OC01] Giltighetsdagens slut följer svensk tid över sommartid**
  - **Given** Aktiv annonser with giltighetsdatum 2027-06-30 (summer time) and 2027-01-15 (winter time)
  - **When** expiry is evaluated at 2027-06-30 21:59:59Z and 22:00:00Z, and at 2027-01-15 22:59:59Z and 23:00:00Z
  - **Then** each annons is Aktiv at the first instant and Utgången at the second

- **S04 [OC02] Giltigheten passerar under köpet (felscenario 3)**
  - **Given** Kalle's köp of an annons with giltighetsdatum 2026-11-17 is Påbörjat, and in a second case Betalning auktoriserad, with the reservation running until 2026-11-18 00:03 Swedish time
  - **When** the Clock passes 2026-11-18 00:00:00 Swedish time and nobody opens any page
  - **Then** within one sweep tick the köp is Misslyckat with orsak "kortet har gått ut" and aktör system, the annons is Utgången and not in sökningen, no dragning is made, Kalle's köp page shows Misslyckat with that orsak and no presentkortskod, and in the authorized case the authorization is released

- **S05 [OC02] Giltigheten passerar mellan butikskontrollen och leveransen**
  - **Given** Kalle's köp is Betalning auktoriserad, the butikskontroll has answered giltig with the full saldo, and the giltighetsdatum ends before the leverans commits – sequentially, and in a second case at the same instant as a concurrent `expireDue`
  - **When** leverans is attempted
  - **Then** exactly one outcome holds and it is never a delivery after the giltighet ended: the köp is Misslyckat with orsak "kortet har gått ut", the annons Utgången, the authorization released and no dragning made; at an instant before the end, either that outcome or Levererat/Såld with one dragning – never parts of both

- **S06 [OC02] Godkänd betalning efter att kortet gått ut**
  - **Given** Kalle's köp is Påbörjat and the annons's giltighetsdatum has ended
  - **When** Kalle approves in the "Simulerad betalning" step
  - **Then** no authorization is kept, no butikskontroll result leads to dragning or leverans, and Kalle sees that the köp failed because "kortet har gått ut"

- **S07 [OC02] Både reservation och giltighet har passerat när regeln körs**
  - **Given** two Reserverad annonser with giltighetsdatum 2026-11-17: one reserved until 2026-11-17 12:05, one until 2026-11-18 00:03 Swedish time
  - **When** `expireDue` first runs at 2026-11-18 01:00 Swedish time (the clock moved past both deadlines)
  - **Then** the köp whose reservation lapsed first is Misslyckat with orsak "reservationen gick ut", the köp whose giltighet ended first is Misslyckat with orsak "kortet har gått ut", and both annonser end Utgången

- **S08 [OC03] Säljaren ser att och varför annonsen gått ut**
  - **Given** Sara's annons with giltighetsdatum 2026-11-17 has become Utgången
  - **When** Sara opens "mina kort"
  - **Then** the annons is listed with status Utgången and the explanation that its giltighetsdatum 2026-11-17 has passerat

- **S09 [OC01,OC03] [runtime] Utgång syns i den startade appen**
  - **Given** the app started with README's start command, and an Aktiv annons of Sara's whose giltighetsdatum is yesterday, Swedish time
  - **When** Kalle opens sökningen and Sara opens "mina kort"
  - **Then** Kalle's sökningen does not list the annons, and Sara sees it as Utgången with the giltighetsdatum explanation
  - **Proof**: `e2e/listing-expiry.spec.ts#expired listing leaves search and is explained to the seller` – red at spec time


## Structural Criteria

- **SC01** The allowed-transitions table gains exactly annons active→expired, flagged→expired and reserved→expired; the köp's failure reuses story S05's started→failed and authorized→failed, and every status change this story adds goes through `transition`.
- **SC02** `expireDue(now)` stays idempotent with the giltighet rule added: a second call with the same `now` changes no row and writes no statushistorik.
- **SC03** The end instant of a giltighetsdatum comes from one `Europe/Stockholm` helper fed by `Clock`; no fixed UTC offset, and no code outside the Clock module reads system time (story S01's SC02, which this diff could break).
- **SC04** No adapter call (void, capture, verify) runs inside a database transaction in the giltighet rule or the leverans path.
- **SC05** Every screen this story changes has no horizontal scroll at 360 px width (PRD NFR Usability).


## Scope & Boundaries

### Work Areas
- `src/domain/` – allowed-transitions table, the giltighet end helper, `expireDue`'s giltighet rule, the leverans commit point's condition, the seller's "mina kort" data
- `src/app/` – "mina kort" shows Utgången with its explanation
- `tests/domain/`, `tests/purchases/`, `tests/my-cards/`, `e2e/listing-expiry.spec.ts`

### What We're NOT Doing
- Refusing publicering with a passed giltighetsdatum – story S03.
- The 7-day short-giltighet warning – story S04.
- Orsak for every status, the statushistorik view and empty states in "mina kort", and the buyer's köp orsak in "mina kort" – story S08; this story adds only the Utgången explanation to the säljare's list and relies on story S05's köp page for the buyer.
- The demo panel moving the clock and calling `expireDue` on move – story S08; the rule only needs to be in `expireDue`.
- Reklamationsperiodens utgång – story S06.
- Expiring Såld, Återkallad or already Utgången annonser, or köp after Levererat – FR8 names only Aktiv, Flaggad and Reserverad before leverans.
- A new sweep, timer or call site – story S05's sweep and call paths already run `expireDue`.


## Architecture Decision

**Approach**: Add the giltighet rule to story S05's ordered `expireDue` rule list and add "giltighet end > now" to the leverans commit point's condition; a commit point that changes zero rows because the giltighet ended runs `expireDue(now)` and returns the resulting köp. Reserverad expiry uses story S05's fail(...) pattern – one transaction moving köp →Misslyckat and annons →Utgången, then void after commit.
**Why this over the floor**: the floor is story S05's rule list without a giltighet rule; FR8 requires the Utgången status and the "kortet har gått ut" failure, and FR5 criterion 4 requires the giltighet check at leverans that the floor's commit point lacks.


## Constraints & Gotchas

- **Constraint**: Stories S03 and S04 each call for a `Europe/Stockholm` end-of-day helper, and this story depends only on story S05, so it may land before either. – Workaround: reuse the helper if one exists; otherwise create it in `src/domain/` as the single helper both stories must reuse, and never a second copy (SC03).
- **Constraint**: When both the reservation and the giltighet have passed by the time `expireDue` runs, rule order decides the orsak. – Workaround: for a Reserverad annons, the earlier of `reserved_until` and the giltighet end decides the orsak (scenario S07); when the reservation came first, story S05's rule reactivates the annons and the Aktiv branch of this rule then expires it in the same call.
- **Constraint**: The prototype's `endOf` uses a fixed `+01:00` offset. – Workaround: copy no date arithmetic from it; summer time ends the day at 22:00Z (scenario S03).


## Implementation Plan

### Implementation Tasks

- **TI01** The allowed-transitions table holds SC01's three new annons rows and no other new row.
  - Pattern: `src/domain/transition.ts#transition` and its table from story S01.
  - **Verify**: `tests/domain/transition.test.ts#listing expiry transitions are allowed and nothing else is added` – asserts each new pair succeeds once with one history row, a repeat changes nothing, and expired→active, sold→expired and withdrawn→expired are refused
  - **SATISFIES**: SC01

- **TI02** One helper returns, for a giltighetsdatum, the instant it ends – 00:00:00 the following day in `Europe/Stockholm` – and an annons counts as expired when `Clock.now()` is at or past that instant.
  - **Verify**: `tests/domain/validity-end.test.ts#giltighetsdatum ends at midnight swedish time across dst` – the four instants of scenario S03, plus 2026-10-25 and 2027-03-28 (DST change days); and `cmd: test -z "$(git grep -nE 'Date\.now\(|new Date\(\)|\+01:00|\+02:00' -- src ':!src/domain/clock.ts')"` – no system-time read or fixed offset in `src`
  - **SATISFIES**: S03, SC03

- **TI03** `expireDue(now)` moves every Aktiv or Flaggad annons whose giltighet has ended to Utgången (aktör system, orsak naming the passed giltighetsdatum), so sökningen and a köp start no longer offer it.
  - Depends on TI01, TI02. Pattern: story S05's reservation rule in `expireDue`.
  - **Verify**: `tests/domain/expire-due.test.ts#active and flagged listings expire after their last day` – scenarios S01 and S02 with a fixed Clock: Aktiv at 23:59:59, Utgången at 00:00:00 for both, history row content, absence from the search result, a refused köp start creating no köp, a second call writing nothing; plus `tests/domain/sweep.test.ts#sweep expires a listing past its validity without any read`
  - **SATISFIES**: S01, S02, SC02

- **TI04** `expireDue(now)` fails the köp of a Reserverad annons whose giltighet ended before leverans with orsak "kortet har gått ut" and moves the annons to Utgången in one transaction, then voids any authorization; when both deadlines have passed, the earlier decides the orsak.
  - Depends on TI03.
  - **Verify**: `tests/domain/expire-due.test.ts#reserved listing past validity fails purchase as card expired` – Påbörjat and Betalning auktoriserad cases of scenario S04 (statuses, orsak, aktör, one void only when authorized, zero captures, no code from the code function, idempotent repeat) and both köp of scenario S07
  - **SATISFIES**: S04, S07, SC02, SC04

- **TI05** The leverans commit point also requires the giltighet end to be after `now`; when it changes zero rows for that reason the köp ends as in TI04, and an approval after the giltighet ended keeps no authorization.
  - Depends on TI04. Pattern: story S05's commit point and its handling of a zero-row betalningsbesked.
  - **Verify**: `tests/purchases/validity-at-delivery.test.ts#expired card is never delivered` – a verifier double that advances the fixed Clock past the giltighet end before answering giltig: asserts Misslyckat "kortet har gått ut", Utgången, one void, zero captures; and an approval after the end (scenario S06) leaving zero kept authorizations and zero captures
  - **SATISFIES**: S05, S06, SC04

- **TI06** Giltighet expiry and leverans racing at the same instant end in exactly one of scenario S05's outcomes.
  - Depends on TI05.
  - **Verify**: `tests/purchases/expiry-race.test.ts#validity expiry and delivery never both apply` – 20 rounds of `Promise.all([expireDue(t), deliver])` with the Clock at the giltighet end, asserting per round the Misslyckat/Utgången set with one void and zero captures; and 20 rounds one millisecond before, each round one consistent outcome and never a capture on a Misslyckat köp
  - **SATISFIES**: S05, SC04

- **TI07** The säljare's "mina kort" shows an Utgången annons with status Utgången and the explanation that its giltighetsdatum has passerat, from the expiry's statushistorik orsak.
  - Depends on TI03. Pattern: story S01's my-cards query in `src/domain/`.
  - **Verify**: `tests/my-cards/my-cards.test.ts#seller sees expired listing with reason` – asserts status and an explanation containing the giltighetsdatum 2026-11-17 for an annons expired by `expireDue`
  - **SATISFIES**: S08

- **TI08** Playwright proves expiry in the app started by `dev`, with the yesterday-dated Aktiv annons written into the demo database by a test fixture.
  - Depends on TI03, TI07.
  - **Verify**: `e2e/listing-expiry.spec.ts#expired listing leaves search and is explained to the seller` – at 360×800, Kalle's sökningen lacks the annons, Sara's "mina kort" shows Utgången with the explanation, and `scrollWidth <= clientWidth` on each visited page
  - **SATISFIES**: S09, SC05

- **TI09** No adapter call sits inside a database transaction callback in the giltighet rule or the leverans path.
  - **Verify**: `inspect: src/domain/purchases.ts` – every `void`, `capture` and `verify` call in the commit point's zero-row handling is outside `db.transaction(...)` callbacks; plus `inspect: src/domain/expire-due.ts` – the same for the giltighet rule
  - **SATISFIES**: SC04


## Settled Decisions

- A giltighetsdatum is valid through 23:59:59.999 Swedish time and the annons expires at 00:00:00 the following day.
- The köp orsak is the PRD's "kortet har gått ut", and the annons's expiry orsak and the säljare's explanation state that giltighetsdatumet (with the date) has passerat, in the prototype's tone.
- When reservation and giltighet have both passed before `expireDue` runs, the earlier deadline decides the köp's orsak, and the annons ends Utgången either way.
- The e2e writes a yesterday-dated Aktiv annons into the demo database through the project's db client, since publicering refuses a passed date (story S03) and the demo panel that moves the clock is story S08's.
- The buyer learns of the expired köp on story S05's köp page; the köp's orsak in "mina kort" waits for story S08.
- If neither story S03 nor story S04 has landed, this story creates the shared `Europe/Stockholm` end-of-day helper and they reuse it.


## Discovered Requirements

- **Title**: Reuse the landed end-of-day helper, expiry rule shape and failure path
  - **Description**: S04 landed `endOfValidity` in `src/domain/dates.ts`, the single `Europe/Stockholm` end-of-day helper (00:00 the next Swedish day, DST-safe); the giltighet rule and the leverans condition use it, so the Settled Decision's "create the helper" branch does not apply. S03's past-date publish check compares calendar dates with `stockholmDate(now)`. A rule in `expiryRules` (`src/domain/expire-due.ts`) is `(deps, now) => AfterCommit[]`. The leverans commit point is `deliverPurchase` in `src/domain/purchases.ts`, conditioned on `gt(listings.reservedUntil, now)`; add the giltighet condition beside it – on zero rows it already runs `expireDue(now)` and returns the current köp. Reserverad expiry reuses `failPurchaseTx` (`src/domain/purchase-failure.ts`) with `listingTo` widened to `expired`. Annons-to-Utgången transitions for Aktiv and Flaggad are new rows in `src/domain/transition.ts`, which now also holds S03's and S05's rows.
  - **Rationale**: The FIS was written before S03–S05 merged, and anticipated but could not name these.
  - **Interpretation**: Extend these; add no second helper, rule mechanism or failure path.
  - **Traced from**: S04/TI01, S05/TI06, S05/TI07
  - **Date**: 2026-11-17
