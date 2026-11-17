# S04: Sök och jämför erbjudanden

**Plan**: docs/specs/applikation-for-kop-och-salj-av/plan.json
**Story-ID**: S04

## Feature Overview and Goal

**Intent**: A buyer standing at a till needs to find, in seconds, the best-discounted gift card for one specific handlare and judge whether it is safe to buy, so the marketplace only pays off when sökningen compares offers on discount, price and remaining giltighet and warns about cards about to lapse.

**Expected Outcomes**:

- [OC01] A logged-in köpare sees every Aktiv annons except their own, with handlare, saldo, pris, rabatt in kronor and procent, giltighetsdatum and kontrollstatus, and can narrow the list to one handlare.
- [OC02] The köpare can order the offers by högst rabatt (default), lägst pris or längst kvarvarande giltighet, and an annons with less than 7 days of giltighet left carries a visible warning in the list and in the annons view.
- [OC03] An urval with no matching annonser shows an empty state that says so, and a visitor without a session who opens sökningen is sent to inloggning with a hint instead of seeing offers.
- [OC04] The annons view shows the köpare everything US05 requires before a köp – saldo, pris, rabatt, giltighetsdatum, kontrollstatus and the short-giltighet warning – and never the presentkortskod.


## Required Context

- `docs/specs/applikation-for-kop-och-salj-av/prd.md#fr4-sök-och-jämför-erbjudanden` – the six acceptance criteria this story implements in full.
- `docs/specs/applikation-for-kop-och-salj-av/prd.md#user-stories` – US04 and US05 rows: filter semantics and what the annons view shows before a köp.
- `docs/specs/applikation-for-kop-och-salj-av/prd.md#user-flows` – flow 1 "filtrerar på NK → öppnar annonsen (15 % rabatt)" is the demo path this story's filter and rabatt serve.
- `docs/specs/applikation-for-kop-och-salj-av/s01-walking-skeleton-for-demoflodet.md` – the sökning, annons view, code-free DTO (its TI08), session redirect (its TI06) and `Clock` (its TI03) this story thickens; its Constraints & Gotchas on RSC payloads and dynamic rendering bind here too.
- `docs/adrs/ADR-005-klocka-och-svep.md#decision` – the short-giltighet warning is computed from `Clock`, never system time.
- `docs/UBIQUITOUS_LANGUAGE.md` – Rabatt, Giltighetsdatum, Erbjudande (UI text only, never a code identifier).
- `docs/prototype/presentkortsmarknaden.html` – `vMarket` and `vDetail`: filter chips, "Sortera" select options, warning pill, empty-state copy and the annons view's "Du sparar … (… %)" line; visual reference, not binding.


## Acceptance Scenarios

- **S01 [OC01] Sökningen visar andras aktiva annonser med rabatt**
  - **Given** Kalle is logged in; Sara has an Aktiv NK annons with saldo 1 000 kr and pris 850 kr; Kalle has his own Aktiv Åhléns annons; Sara also has annonser with status Reserverad, Såld, Flaggad, Utgången and Återkallad
  - **When** Kalle opens sökningen without filter or sortering
  - **Then** the list holds Sara's NK annons and no other, showing handlare Nordiska Kompagniet, saldo 1 000 kr, pris 850 kr, rabatt 150 kr and 15 %, giltighetsdatum and kontrollstatus "Kontrollerad (simulerat)"

- **S02 [OC01] Filter på handlare**
  - **Given** Kalle is logged in and other users have Aktiv annonser at NK (two), Åhléns (one) and ICA (one)
  - **When** Kalle selects handlare NK in the filter
  - **Then** only the two NK annonser are listed; **When** he selects "Alla", all four are listed again

- **S03 [OC02] Sortering, standard högst rabatt**
  - **Given** Kalle is logged in and other users' Aktiv annonser A (saldo 1 000, pris 900, giltig 2027-06-30), B (saldo 500, pris 350, giltig 2027-01-31) and C (saldo 200, pris 170, giltig 2027-12-31)
  - **When** Kalle opens sökningen, then selects "Lägst pris", then "Längst giltighet"
  - **Then** the order is B (30 %), C (15 %), A (10 %) by default; C, B, A by lägst pris; C, A, B by längst giltighet
  - **And** with handlare filter and sortering both selected, the filtered list keeps the chosen order

- **S04 [OC02] Varning vid mindre än 7 dagar kvar**
  - **Given** the Clock reads 2026-11-17 12:00 Swedish time and other users' Aktiv annonser with giltighetsdatum 2026-11-23 (6½ days left until the end of that day, Swedish time) and 2026-11-24 (7½ days left)
  - **When** Kalle views sökningen and opens each annons
  - **Then** the 2026-11-23 annons shows the warning "Mindre än 7 dagar kvar" in the list and the annons view; the 2026-11-24 annons shows no warning in either

- **S05 [OC03] Tomt läge när inget matchar**
  - **Given** Kalle is logged in, the only Aktiv annonser are Kalle's own and another user's NK annons
  - **When** Kalle filters on Filmstaden
  - **Then** the list area says that no erbjudanden exist for the urval and offers a way back to all handlare; **and when** no annons but Kalle's own is Aktiv, sökningen without filter shows the same empty state

- **S06 [OC01,OC02] Ogiltigt filter- eller sorteringsval**
  - **Given** Kalle is logged in and other users have Aktiv annonser at NK and ICA
  - **When** sökningen is requested with a handlare that is not in the handlare list, or a sortering that is not one of the three
  - **Then** an unknown handlare yields the empty state of scenario S05 and an unknown sortering falls back to högst rabatt; neither yields an error page

- **S07 [OC03] [runtime] Utloggad besökare hänvisas till inloggning**
  - **Given** a browser without a session
  - **When** it opens sökningen, also with a handlare filter selected
  - **Then** it lands on inloggning showing a hint that inloggning is needed to see erbjudanden, receives no annons data, and after logging in with the simulated SMS lands on sökningen
  - **Proof**: `e2e/search.spec.ts#logged out visitor is sent to login with a hint` – red at spec time

- **S08 [OC04] Annonsvyn visar det köparen behöver före köp**
  - **Given** Sara's Aktiv NK annons with saldo 1 000 kr, pris 850 kr and presentkortskod `NK-4471-9920`
  - **When** Kalle opens it from sökningen
  - **Then** he sees handlare, saldo 1 000 kr, pris 850 kr, rabatt 150 kr (15 %), giltighetsdatum, kontrollstatus "Kontrollerad (simulerat)" and the köp button, and the response carries no `NK-4471-9920`

- **S09 [OC01,OC02] [runtime] Hitta och jämföra i webbläsaren**
  - **Given** the app started with README's start command, Sara logged in with published NK and Åhléns annonser, and Kalle logged in in another browser session at 360 × 800
  - **When** Kalle filters on NK, changes sortering and opens the NK annons
  - **Then** only NK annonser are listed in the chosen order with rabatt in kr and %, and the annons view shows scenario S08's fields
  - **Proof**: `e2e/search.spec.ts#buyer filters on merchant, sorts and opens a listing` – red at spec time


## Structural Criteria

- **SC01** Sökningen's and the annons view's queries still select a DTO without the presentkortskod column for every filter and sortering combination.
- **SC02** Rabatt and the short-giltighet warning are computed in one domain module from `Clock` and the stored saldo, pris and giltighetsdatum; pages only render the values it returns.
- **SC03** Sökningen and the annons view have no horizontal scroll at 360 px width with the filter, sortering and warning shown (PRD NFR Usability).


## Scope & Boundaries

### Work Areas
- `src/domain/` – the search query and annons-view DTO from story S01, plus the rabatt/giltighet module
- `src/app/` – sökning page (filter, sortering, empty state), annons view, inloggning hint and post-login landing
- `tests/listings/`, `e2e/search.spec.ts`

### What We're NOT Doing
- Free-text search, price range filter, pagination or saved searches – FR4 names only handlare filter and three sorteringar, and the Product stage is a prototype with a handful of demo users.
- Turning an Aktiv annons past its giltighetsdatum into Utgången, and hiding it – story S07; until then sökningen trusts the stored status.
- The seller's own annons view (edit, återkallelse, Flaggad orsak) – story S03. Opening one's own annons by URL and the refusal of buying it – story S05.
- The annons view for a non-Aktiv annons ("redan reserverad" and similar messages) – story S05.
- The demo panel moving the simulated klocka to show the warning – story S08.
- Any change to the köp flow behind the köp button – stories S01 and S05.


## Architecture Decision

**Approach**: Filter and sortering travel as URL search parameters of the server-rendered sökning page, validated against the seeded handlare and the three sort keys, and passed to the domain search function, which filters out the viewer's own annonser and non-Aktiv annonser in the query and returns DTOs enriched with rabatt and the warning flag from the SC02 module.
**Why this over the floor**: the floor is story S01's unfiltered list; FR4 criteria 2–4 (filter, three sorteringar, 7-day warning) rule it out. URL parameters over client-side state keep the code-free data on the server and make the filtered view linkable and testable without client JavaScript.


## Constraints & Gotchas

- **Constraint**: Giltighetsdatum is a calendar date whose validity ends at the end of that day, Swedish time (PRD FR8, Ubiquitous Language), and Swedish time switches between UTC+1 and UTC+2. – Workaround: compute the end instant with the `Europe/Stockholm` zone, never a fixed offset as the prototype's `endOf` does; warning when end − Clock.now is under 7 × 24 h. Reuse the `Europe/Stockholm` end-of-day helper if story S03 or S07 has already added it; otherwise create it as the single one (story S07's Constraints).
- **Constraint**: Sorting by the rounded percentage gives unstable ties. – Workaround: sort on the exact ratio (saldo − pris) / saldo, display it rounded to whole percent, and break every tie by earliest publication.


## Implementation Plan

### Implementation Tasks

- **TI01** One domain module returns, for an annons and a `Clock`, rabatt in kronor, rabatt in whole procent (rounded half up) and whether the short-giltighet warning applies, measured to the end of giltighetsdatum in Swedish time.
  - **Verify**: `tests/listings/discount-validity.test.ts#discount and remaining validity follow the documented rules` – asserts 1 000/850 → 150 kr and 15 %; with a fixed Clock at 2026-11-17 12:00 Swedish time, 2026-11-23 → warning and 2026-11-24 → no warning; a date across the DST change (2027-03-28) ends at 00:00:00 the following day, Swedish time (the end instant of story S07's TI02)
  - **SATISFIES**: S01, S04, SC02

- **TI02** The search function takes the viewer, an optional handlare and an optional sortering, and returns Aktiv annonser of others only, filtered and ordered per the Architecture Decision and the ties rule, each DTO carrying TI01's values and no presentkortskod.
  - Depends on TI01. Extends story S01's search query.
  - **Verify**: `tests/listings/search.test.ts#search excludes own and non-active listings and filters on merchant` – scenarios S01 and S02's fixtures; plus `tests/listings/search.test.ts#search sorts by discount by default, by price and by validity` – scenario S03's orders including with a filter; plus story S01's `tests/listings/search.test.ts#search and listing view never carry the gift card code` run over every filter and sortering combination
  - **SATISFIES**: S01, S02, S03, SC01

- **TI03** The sökning page reads handlare and sortering from the URL, offers "Alla" plus the seeded handlare and the sort options "Högst rabatt", "Lägst pris" and "Längst giltighet", treats an unknown handlare as an empty urval and an unknown sortering as högst rabatt, and lists TI02's results with rabatt in kr and %, kontrollstatus and the warning.
  - Depends on TI02.
  - **Verify**: `tests/listings/search-params.test.ts#unknown merchant gives empty result and unknown sort falls back to discount` – the parameter parsing of scenario S06
  - **SATISFIES**: S02, S03, S04, S06

- **TI04** An empty result shows the text "Inga erbjudanden för det här urvalet just nu." and, when a handlare is selected, a control back to all handlare.
  - Depends on TI03.
  - **Verify**: `e2e/search.spec.ts#empty selection shows the no-offers state` – Filmstaden filter and the only-own-annons case of scenario S05
  - **SATISFIES**: S05

- **TI05** The annons view shows handlare, saldo, pris, rabatt in kr and %, giltighetsdatum, kontrollstatus and the warning from TI01, still from the code-free DTO.
  - Depends on TI01.
  - **Verify**: `tests/listings/listing-view.test.ts#listing view shows discount, validity warning and check status without the code` – scenario S08's values and scenario S04's two dates under a fixed Clock; serializes the result and asserts `NK-4471-9920` is absent
  - **SATISFIES**: S04, S08, SC01

- **TI06** A visitor without a session who opens sökningen is redirected to inloggning, which then shows "Logga in för att se erbjudanden", and a successful inloggning from there lands on sökningen.
  - Builds on story S01's session redirect (its TI06).
  - **Verify**: `e2e/search.spec.ts#logged out visitor is sent to login with a hint` – asserts the redirect with and without a handlare parameter, the hint, that no recorded response body holds annons data, and the landing on sökningen after inloggning
  - **SATISFIES**: S07

- **TI07** Playwright drives the find-and-compare path at 360 × 800 against the app started by `dev`.
  - Depends on TI03–TI05.
  - **Verify**: `e2e/search.spec.ts#buyer filters on merchant, sorts and opens a listing` – scenario S09, plus `scrollWidth <= clientWidth` on sökningen with filter, sortering and a warning shown and on the annons view
  - **SATISFIES**: S09, SC03


## Settled Decisions

- Rabatt in procent is rounded half up to whole percent for display, while sorting uses the exact ratio.
- Ties in every sortering are broken by earliest publication.
- "Mindre än 7 dagar kvar" means less than 7 × 24 h from the Clock's now to the end of giltighetsdatum in Swedish time, and the warning reads "Mindre än 7 dagar kvar" without a day count.
- An unknown handlare in the URL gives the empty state and an unknown sortering falls back to högst rabatt.
- After inloggning reached from sökningen the user always lands on sökningen (no arbitrary return URL, avoiding an open redirect), and the hint text is "Logga in för att se erbjudanden".
- The empty-state copy is the prototype's "Inga erbjudanden för det här urvalet just nu."
