# S03: Publicera och hantera annons

**Plan**: docs/specs/applikation-for-kop-och-salj-av/plan.json
**Story-ID**: S03

## Feature Overview and Goal

**Intent**: A buyer can only trust an annons if every listed presentkort has passed the same rules and butikskontroll and cannot be sold twice, and a seller only gets value if an annons that stops selling or gets flagged can be fixed or withdrawn – this story makes publicering strict and gives the säljare control over the annons without ever disturbing an ongoing köp.

**Expected Outcomes**:

- [OC01] A publicering that breaks the prisregel, has a passed giltighetsdatum, is incomplete or is not approved by the butikskontroll is refused with a reason the säljare can act on, and creates no annons.
- [OC02] A presentkortskod that has occurred in any annons for a handlare can never be listed again for that handlare.
- [OC03] The säljare can change the pris, correct presentkortskod or saldo, bring a Flaggad annons back to Aktiv after a new butikskontroll, and withdraw the annons, each change visible in sökningen and recorded in statushistoriken.
- [OC04] No annons changes while it is Reserverad, Såld, Utgången or Återkallad, nor at the hand of anyone but its säljare.


## Required Context

- `docs/specs/applikation-for-kop-och-salj-av/prd.md#fr2-publicera-annons` – publicering's rules and rejection criteria this story completes.
- `docs/specs/applikation-for-kop-och-salj-av/prd.md#fr3-hantera-egen-annons` – every edit, rättning and återkallelse criterion.
- `docs/specs/applikation-for-kop-och-salj-av/prd.md#edge-cases` – felscenario 6 is this story's; the table's rows belong to stories S05–S07.
- `docs/specs/applikation-for-kop-och-salj-av/prd.md#user-flows` – flow 4's last steps ("säljaren rättar saldot → annonsen blir Aktiv").
- `docs/specs/applikation-for-kop-och-salj-av/s01-walking-skeleton-for-demoflodet.md` – the publish flow, `transition` helper, verifier table (story S01's scenario S08), DTO rule for the presentkortskod and Key Dev Commands this story extends.
- `docs/adrs/ADR-003-atomara-statusovergangar.md#decision` – conditional UPDATE on the prior status; zero affected rows is a domain error.
- `docs/UBIQUITOUS_LANGUAGE.md` – Swedish UI terms and English identifiers (Flaggad `flagged`, Återkallad `withdrawn`, Dubblettkontroll `duplicateCheck`, Saldoavvikelse `balanceMismatch`).
- `docs/prototype/presentkortsmarknaden.html` – seller actions on the annons view (`data-act="saveprice"`, `fix`, `withdraw`) as copy and layout reference; not binding.


## Acceptance Scenarios

- **S01 [OC01] Prisregeln nekar publicering**
  - **Given** Sara is logged in and fills in handlare NK, a code the butikskontroll answers giltig, saldo 1 000 kr and a future giltighetsdatum
  - **When** she submits pris 0 kr, then 1 000 kr, then 1 200 kr
  - **Then** each submission is refused with a message naming the bounds (more than 0 kr and less than the saldo 1 000 kr), no annons is created and the butikskontroll is not called; pris 999 kr is accepted

- **S02 [OC01] Passerat giltighetsdatum nekar publicering**
  - **Given** the Clock reads 2026-11-17 10:00 Swedish time
  - **When** Sara submits an otherwise valid annons with giltighetsdatum 2026-11-16
  - **Then** publicering is refused with a message that the giltighetsdatum has passed and no annons is created; giltighetsdatum 2026-11-17 (today, valid to the day's end) is accepted

- **S03 [OC01] Ofullständiga uppgifter nekas**
  - **Given** Sara is logged in
  - **When** she submits without presentkortskod, with a handlare outside the seeded list, or with saldo or pris that is not a whole number of kronor
  - **Then** publicering is refused with a message naming the faulty field and no annons is created

- **S04 [OC01] Butikskontrollens nekande utfall vid publicering**
  - **Given** Sara submits saldo 1 000 kr, pris 850 kr and a future giltighetsdatum
  - **When** the presentkortskod starts with `OGILTIG`, `SALDO`, `TIMEOUT` or `FEL` (story S01's verifier table), or the butikskontroll does not answer within the configured 5 seconds
  - **Then** no annons is created, and Sara sees, in a message marked as simulated: for `OGILTIG` that the code was not approved; for `SALDO` the controlled saldo 800 kr so she can correct it, and resubmitting the same `SALDO` code with saldo 800 kr and pris 700 kr publishes it as Aktiv; for `TIMEOUT`, `FEL` and a call unanswered after 5 s that the kontroll could not be completed and she can try again
  - **And** a later submission of the same presentkortskod is not refused by the dubblettkontroll, since no annons held it

- **S05 [OC02] Dubblettkontroll**
  - **Given** handlare NK has had annonser with presentkortskod `NK-1111` (now Såld) and `NK-2222` (now Återkallad), and an Aktiv NK annons whose code was corrected from `NK-3333` to `NK-3334`
  - **When** any user submits an NK annons with `NK-1111`, `NK-2222` or `NK-3333`, and two users submit an NK annons with the same new code `NK-5555` at the same moment
  - **Then** the first three are refused with a message that the code has already been listed for the handlare, exactly one of the two `NK-5555` submissions creates an annons, and an ICA annons with code `NK-1111` is accepted
  - **And** a correction of an annons's presentkortskod (scenarios S07 and S08) to a code an earlier annons for the same handlare held is refused the same way

- **S06 [OC03] Prisändring på Aktiv annons**
  - **Given** Sara's Aktiv NK annons with saldo 1 000 kr and pris 850 kr
  - **When** she changes the pris to 800 kr
  - **Then** the annons stays Aktiv with pris 800 kr, Kalle's sökning and annons view show 800 kr, its statushistorik gains a row with tidpunkt, aktör Sara and an orsak naming the change, and no butikskontroll runs; pris 0 kr or 1 000 kr is refused per scenario S01's message and the pris stays 850 kr

- **S07 [OC03] Ändrad kod eller saldo på Aktiv annons kontrolleras igen**
  - **Given** Sara's Aktiv NK annons with presentkortskod `NK-4471`, saldo 1 000 kr and pris 850 kr
  - **When** she changes the code to `NK-4472`, and separately the saldo to 900 kr
  - **Then** the butikskontroll runs for each at publicering phase; on giltig with the same saldo the change is saved, the annons stays Aktiv and the statushistorik gains a row
  - **When** she instead changes the code to one starting with `OGILTIG`, `SALDO`, `TIMEOUT` or `FEL`, or the saldo to 800 kr while the pris is 850 kr
  - **Then** the change is refused with scenario S04's reason (or the prisregel's for the saldo), and the annons keeps code `NK-4471`, saldo 1 000 kr, pris 850 kr and status Aktiv

- **S08 [OC03] [runtime] Säljaren rättar en Flaggad annons (slutet på flöde 4)**
  - **Given** Sara's NK annons with saldo 1 000 kr and pris 850 kr is Flaggad with orsak saldoavvikelse, and its presentkortskod starts with `DELVIS`, which the butikskontroll at publicering answers giltig with whatever saldo is entered (story S01's verifier table)
  - **When** Sara opens the annons, sees it is Flaggad and why, enters saldo 800 kr and pris 700 kr and submits
  - **Then** the butikskontroll runs again, the annons becomes Aktiv with saldo 800 kr and pris 700 kr, its flaggningsorsak is cleared, it is marked "Kontrollerad (simulerat)", the statushistorik records Flaggad → Aktiv with aktör Sara, and Kalle finds it in sökningen
  - **And** had the new butikskontroll not approved, the annons would stay Flaggad with its earlier values and Sara would see the reason
  - **Proof**: `e2e/manage-listing.spec.ts#seller corrects a flagged listing back to active` – red at spec time

- **S09 [OC03] Enbart prisändring på Flaggad annons nekas**
  - **Given** Sara's Flaggad annons
  - **When** she changes only the pris
  - **Then** the change is refused with a message telling her to correct the presentkortskod or the saldo, and the annons is unchanged and still Flaggad

- **S10 [OC03] Återkallelse**
  - **Given** one Aktiv and one Flaggad annons of Sara's
  - **When** she withdraws each
  - **Then** both become Återkallad, neither appears in sökningen, and each statushistorik records the change with aktör Sara

- **S11 [OC04] Ingen ändring under ett köp eller efter det (felscenario 6)**
  - **Given** Sara's annons is Reserverad for Kalle, and other annonser of hers are Såld, Utgången and Återkallad
  - **When** Sara tries to change pris, presentkortskod or saldo, or to withdraw, on each
  - **Then** each attempt is refused with a message stating the annons's current status, and pris, code, saldo, status and Kalle's reservation and köp are unchanged
  - **And** when Kalle's reservation commits while Sara's code change awaits the butikskontroll, her change is refused the same way and the reservation holds

- **S12 [OC04] Endast säljaren får ändra eller återkalla**
  - **Given** Sara's Aktiv annons with presentkortskod `NK-4471`
  - **When** Kalle tries to change its pris, code or saldo or to withdraw it, and Sara tries the same on an annons id that does not exist
  - **Then** every attempt is refused with the same not-found-or-not-yours error, the annons is unchanged, and no response to Kalle contains `NK-4471`


## Structural Criteria

- **SC01** Every annons write this story adds that touches status, pris, presentkortskod or saldo goes through story S01's `transition`, conditioned on the status read before any butikskontroll; the allowed-transitions table gains exactly active→active (edit), flagged→active (rättning), active→withdrawn and flagged→withdrawn.
- **SC02** Every screen this story adds or changes has no horizontal scroll at 360 px width (PRD NFR Usability).


## Scope & Boundaries

### Work Areas
- `src/db/` – a record of every presentkortskod held by an annons per handlare, unique on (handlare, code), and its migration
- `src/domain/` – publicering's validation, dubblettkontroll and outcome messages; edit, rättning and återkallelse; allowed-transitions rows; config for the butikskontroll timeout
- `src/app/` – publish form errors; seller management on the annons view (pris, code/saldo, rättning, återkallelse), reached from "mina kort"
- `tests/`, `e2e/`

### What We're NOT Doing
- Changing handlare or giltighetsdatum of a published annons – FR3 names only pris, code and saldo.
- Flagging an annons at köp, the köp's outcomes and void – story S05. This story's Flaggad annonser come from test fixtures.
- Setting annonser to Utgången – story S07. Scenario S11's Utgången annons is a fixture.
- Flaggningsorsak and Utgången orsak in "mina kort" lists, the statushistorik view and empty states – story S08. The annons view shows the orsak only where scenario S08 needs it.
- Search filters, sortering and rabatt – story S04.
- PRD Edge Cases table rows: none is exercised here; they belong to stories S05–S07 (narrowing note for the Edge-Cases binding constraint). Felscenario 6 is scenario S11.
- Deleting annonser – återkallelse keeps the row and its code for the dubblettkontroll.


## Architecture Decision

**Approach**: Publicering and every edit run as: validate inputs and the prisregel → dubblettkontroll → butikskontroll (outside any transaction, bounded by a configurable 5 s timeout) → one transaction doing the conditional `transition` on the status read at the start, plus the insert into the per-handlare code record whose unique index makes concurrent duplicates fail. Pris-only edits on an Aktiv annons skip the butikskontroll.
**Why this over the floor**: the floor is story S01's publish with no edit path; FR3 requires edits and FR2's dubblettkontroll "oavsett dess status" needs codes kept after a code is replaced, which no column on the annons alone retains.


## Constraints & Gotchas

- **Constraint**: an active→active edit passes `transition`'s conditional UPDATE on every repeat, unlike other transitions – Workaround: refusal while Reserverad comes from the condition on `active`, not from repeat-detection; scenario S11's race case must be tested explicitly.
- **Constraint**: Drizzle's better-sqlite3 transactions are synchronous (story S01's Constraints) – Workaround: await the butikskontroll before opening the transaction, then let the status condition catch anything that changed meanwhile.
- **Constraint**: "today" and a passed giltighetsdatum depend on Swedish time, not the host's time zone – Workaround: derive the date from the Clock in `Europe/Stockholm`, in one helper that story S07 can reuse; if story S04 or S07 has already added that helper, reuse it rather than adding a second (story S07's Constraints).


## Implementation Plan

### Implementation Tasks

- **TI01** The schema holds a record of each presentkortskod an annons has held, unique on (handlare, code) and linked to the annons; publicering inserts into it in the annons-creating transaction.
  - **Verify**: `tests/listings/duplicate.test.ts#a code once listed for a merchant cannot be listed again` – asserts the Såld, Återkallad and replaced-code cases, the other-handlare acceptance, and exactly one success for two parallel `NK-5555` publishes
  - **SATISFIES**: S05

- **TI02** Publicering refuses missing or malformed fields, a pris outside 0 < pris < saldo and a passed giltighetsdatum before calling the butikskontroll, each with a field-specific domain error.
  - **Verify**: `tests/listings/publish-validation.test.ts#price rule, past date and malformed input are refused before the check` – asserts every case in scenarios S01–S03, the boundary acceptances (999 kr, today's date with the fixed Clock at 23:30 Swedish time), no annons row, and a verifier spy with zero calls
  - **SATISFIES**: S01, S02, S03

- **TI03** Each non-giltig butikskontroll outcome at publicering yields its own simulated-marked message, the controlled saldo included for a different saldo, and a verifier call unanswered within the configured timeout counts as inget svar.
  - Pattern: the verifier adapter from story S01's TI05.
  - **Verify**: `tests/listings/publish-check-outcomes.test.ts#each rejecting check outcome gives its reason and creates nothing` – one case per prefix plus a never-resolving fake verifier with a short configured timeout, and a resubmission of the same code that is not refused as a duplicate
  - **SATISFIES**: S04

- **TI04** The allowed-transitions table holds the four rows SC01 names and no other new row.
  - **Verify**: `tests/domain/transition.test.ts#listing management transitions are allowed and nothing else is added` – asserts each new pair succeeds with one history row, and pairs such as reserved→active, sold→withdrawn and withdrawn→active are refused
  - **SATISFIES**: SC01

- **TI05** The säljare changes the pris of an Aktiv annons under the prisregel, through active→active with a statushistorik row and no butikskontroll.
  - Depends on TI04.
  - **Verify**: `tests/listings/edit.test.ts#price change on an active listing` – asserts scenario S06's saved pris, history row, search DTO, refused bounds and a verifier spy with zero calls
  - **SATISFIES**: S06

- **TI06** Code or saldo changes on an Aktiv or Flaggad annons (optionally with a new pris) apply the prisregel and dubblettkontroll, re-run the butikskontroll, and save – setting Aktiv and clearing the flaggningsorsak – only on giltig with the same saldo; any other outcome keeps values and status; pris alone on Flaggad is refused.
  - Depends on TI01, TI03, TI04.
  - **Verify**: `tests/listings/edit.test.ts#code or balance change is rechecked and saved only when approved` – scenarios S07, S08 (flagged fixture with saldoavvikelse) and S09, asserting values, status, flaggningsorsak and history rows; plus `tests/listings/duplicate.test.ts#a corrected code may not reuse an earlier listing's code`
  - **SATISFIES**: S05, S07, S08, S09

- **TI07** The säljare withdraws an Aktiv or Flaggad annons to Återkallad, which drops it from sökningen.
  - Depends on TI04.
  - **Verify**: `tests/listings/withdraw.test.ts#active and flagged listings can be withdrawn` – asserts status, history row with aktör, and absence from the search result
  - **SATISFIES**: S10

- **TI08** Edits and återkallelse on an annons that is Reserverad, Såld, Utgången or Återkallad – including one reserved between reading the status and saving – are refused with the current status, leaving annons, reservation and köp unchanged.
  - Depends on TI05–TI07.
  - **Verify**: `tests/listings/edit-guards.test.ts#no change while reserved or after` – fixtures per status; the race case uses a verifier fake that reserves the annons through the köp domain function before answering giltig
  - **SATISFIES**: S11

- **TI09** Edit and återkallelse refuse anyone but the annons's säljare and unknown annons ids with one indistinguishable error, never carrying the presentkortskod.
  - **Verify**: `tests/listings/edit-guards.test.ts#only the seller may edit or withdraw` – asserts Kalle's four attempts and Sara's unknown-id attempt are refused, the annons is unchanged and the serialized responses lack `NK-4471`
  - **SATISFIES**: S12

- **TI10** The publish form shows each domain error at its field; the säljare's annons view, linked from "mina kort", shows status (with orsak when Flaggad) and offers the pris change and återkallelse when Aktiv, code/saldo/pris correction and återkallelse when Flaggad, and only the status otherwise.
  - Depends on TI02, TI03, TI05–TI07. Pattern: the prototype's seller actions on the annons view.
  - **Verify**: `e2e/manage-listing.spec.ts#seller edits price, sees publish errors and withdraws` – at 360×800, a pris 1 000 kr publish shows the bounds message, a pris change shows in Kalle's sökning, återkallelse removes it, and `scrollWidth <= clientWidth` on each visited page
  - **SATISFIES**: S01, S06, S10, SC02

- **TI11** Playwright drives scenario S08 against the app started by `dev`, with the Flaggad annons written into the demo database by a test fixture.
  - Depends on TI06, TI10.
  - **Verify**: `e2e/manage-listing.spec.ts#seller corrects a flagged listing back to active` – asserts the Flaggad orsak shown, Aktiv with the new values and the "Kontrollerad (simulerat)" label after submit, Kalle finding it in sökningen, and no horizontal scroll at 360 px
  - **SATISFIES**: S08, SC02


## Settled Decisions

- A pris-only edit on an Aktiv annons is recorded as an active→active statushistorik row with an orsak naming the change, satisfying FR3's "uppdaterad annons och statushistorik".
- Publicering checks inputs, prisregel and giltighetsdatum first, then the dubblettkontroll, then the butikskontroll, so no simulated call is wasted on a refusable annons.
- A code refused by the butikskontroll at publicering is not recorded for the dubblettkontroll, since no annons held it.
- The dubblettkontroll compares presentkortskoder exactly as stored after trimming surrounding whitespace, case-sensitive.
- The 5 s butikskontroll timeout is configurable alongside the other times and wraps the verifier call at publicering and edit; story S05 may reuse it at köp.
- Scenario S08's e2e writes the Flaggad annons into the demo database file through the project's db client, since story S05's köp path that flags an annons may not exist yet.
- Edit refusals for another user's annons and an unknown id share one not-found error so annons ids reveal nothing.
- Sökningen already shows only Aktiv annonser (story S01), so Återkallad and Flaggad annonser leave it without a search change here.
- Messages are Swedish and follow the prototype's tone; exact wording is free as long as each states what the scenario requires.


## Discovered Requirements

- **Title**: Field-specific refusals reach the form. **Description**: `DomainError` carries an optional `field`, `ActionResult` passes it on, and `FieldError` shows the message at that field (TI02's "field-specific domain error", TI10's "at its field"). **Rationale**: S01's form showed one message under the form and had no field channel. **Interpretation**: a refusal without a field (butikskontroll could not be completed, status refusals) still shows under the form. **Traced from**: TI02, TI10. **Date**: 2026-11-17.
- **Title**: An empty number field is not 0. **Description**: the publish and edit actions read an empty saldo or pris as not-a-number, so it is refused as "Ange … i hela kronor" rather than reaching the prisregel as 0. **Rationale**: `Number("")` is 0, which would report the bounds instead of naming the missing field (scenario S03). **Interpretation**: conservative – field message first. **Traced from**: TI02. **Date**: 2026-11-17.


## Implementation Observations

- ASSUMPTION: correcting an annons's presentkortskod back to a code the same annons held earlier is refused by the dubblettkontroll, since the record is unique per (handlare, code) – a decision to allow an annons to return to its own earlier code would change it.
- ASSUMPTION: the Aktiv annons view also offers code/saldo change inside a collapsed "Ändra kod eller saldo" disclosure, beyond TI10's literal "pris change and återkallelse when Aktiv", so OC03's code/saldo change on an Aktiv annons is reachable in the UI – a decision that Aktiv code/saldo edits stay domain-only would remove it.
- The verifier timeout lives in config as `verifierTimeoutMs` (env `VERIFIER_TIMEOUT_SECONDS`, default 5) and is applied by `checkGiftCard` in `src/domain/gift-card-check.ts`; the sharedDecision "Simulatorer och svarstabell" assigns the 5 s timeout to S05, which runs in parallel and plans its own config entry (S05 TI05) – S05 should reuse `checkGiftCard` and this config key instead of adding a second. The race uses `setTimeout`, not a system-time read (S05 SC03 stays green).
- `ListingDto` gained `flagReason`; the säljare's annons view shows "Ej godkänd" instead of "Kontrollerad (simulerat)" while a flaggningsorsak is set (also after återkallelse of a Flaggad annons – review finding F2, applied).
- Migration `drizzle/0001_listing_codes.sql` adds `listing_codes`; a sibling story generating its own `0001_*` migration will conflict in `drizzle/meta/_journal.json` and needs regenerating at merge.
- Review finding F1 (LOW, Routing: Note) – `src/domain/listings.ts` `editListing`: two concurrent edits by the same säljare on an Aktiv annons both pass the status-only condition, so the later commit can overwrite the earlier one's pris. Fix would be a `guard` on the read values; left per ADR-003's status-only design and demo scale.
- Visual validation P3 (Routing: Note): the "Ändra kod eller saldo" summary is a 28 px touch target (`src/app/globals.css`); "Återkalla annonsen" sits ~10 px below the primary button when the correction form is open; the header reads "Erbjudande" on the säljare's own annons.
- NOTICED BUT NOT TOUCHING: `e2e/demo-flow.spec.ts`, `e2e/auth.spec.ts` and `e2e/manage-listing.spec.ts` each define their own `logIn`/`expectNoHorizontalScroll` helpers; a shared `e2e/support.ts` would remove the duplication (left alone while S04/S05 edit the same specs in parallel).
