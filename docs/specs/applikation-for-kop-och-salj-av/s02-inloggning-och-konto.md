# S02: Inloggning och konto

**Plan**: docs/specs/applikation-for-kop-och-salj-av/plan.json
**Story-ID**: S02

## Feature Overview and Goal

**Intent**: Let anyone at the demo – not only the seeded test users – get into the marketplace with just a mobilnummer, and make sure a mistyped number or a wrong, stale or reused inloggningskod never logs anyone in nor leaves the user stuck.

**Expected Outcomes**:

- [OC01] A new person creates an account with mobilnummer, förnamn and efternamn and logs in with the inloggningskod from the simulated SMS.
- [OC02] A user who starts in the wrong place – inloggning for an unregistered number, kontoskapande for a registered one – is sent to the right place with the mobilnummer kept.
- [OC03] An invalid mobilnummer, or a wrong, expired or already used inloggningskod, logs nobody in; the user sees a felmeddelande and can request a new inloggningskod.


## Required Context

- `docs/specs/applikation-for-kop-och-salj-av/prd.md#fr1-inloggning-med-simulerad-sms-kod` – the acceptance criteria this story completes; story S01 built only the registered-number happy path.
- `docs/specs/applikation-for-kop-och-salj-av/s01-walking-skeleton-for-demoflodet.md` – story S01's login (its TI06), sessions table, `SmsSender`, Clock and config (inloggningskod validity 10 min, its TI03) that this story extends rather than replaces.
- `docs/adrs/ADR-005-klocka-och-svep.md#decision` – code age is measured with the injected `Clock`, so tests use the fixed clock.
- `docs/UBIQUITOUS_LANGUAGE.md` – "Inloggningskod" is always written in full in UI text, never "kod" alone or "OTP".
- `docs/prototype/presentkortsmarknaden.html` – `vLogin` and `A.reqcode`/`A.create`/`A.login` as visual and copy reference for the three login steps; not a binding spec.


## Acceptance Scenarios

- **S01 [OC01] [runtime] Ny användare skapar konto och loggar in**
  - **Given** the app started with README's start command and no account for 0739876543
  - **When** a visitor opens kontoskapande, enters mobilnummer "073-987 65 43", förnamn Nora and efternamn Berg, and enters the six-digit inloggningskod shown in the box labelled "Simulerat SMS"
  - **Then** an account for 0739876543 named Nora Berg exists with role användare, the visitor is logged in as Nora and reaches sökningen
  - **Proof**: `e2e/auth.spec.ts#new user creates account and logs in` – red at spec time

- **S02 [OC02] Oregistrerat nummer hänvisas till kontoskapande**
  - **Given** no account for 0739876543
  - **When** a visitor requests an inloggningskod for 0739876543
  - **Then** no inloggningskod is sent, and the visitor is shown kontoskapande with mobilnummer 0739876543 already filled in and a message that no account exists for the number

- **S03 [OC02] Befintligt konto vid kontoskapande hänvisas till inloggning**
  - **Given** seeded Kalle's account for 0707654321
  - **When** a visitor submits kontoskapande with 0707654321, förnamn Karl and efternamn Ek
  - **Then** no account is created, Kalle's name is unchanged, and the visitor is shown inloggning with 0707654321 filled in and a message that an account already exists

- **S04 [OC03] Ogiltigt svenskt mobilnummer nekas**
  - **Given** any visitor
  - **When** they request an inloggningskod or submit kontoskapande with "0812345678" (not a mobilnummer), "07012345" (too short) or "abc"
  - **Then** the request is refused with a felmeddelande naming the expected format, no inloggningskod is sent and no account is created
  - **And** "070-123 45 67", "070 123 45 67" and "+46 70 123 45 67" are all accepted as the same mobilnummer 0701234567 (seeded Sara)

- **S05 [OC01] Förnamn eller efternamn saknas**
  - **When** a visitor submits kontoskapande for a valid unregistered number with förnamn or efternamn empty or only spaces
  - **Then** the request is refused with a felmeddelande, and no account is created and no inloggningskod sent

- **S06 [OC03] Fel inloggningskod nekas**
  - **Given** Kalle has requested an inloggningskod
  - **When** he enters a six-digit code that differs from it
  - **Then** he is not logged in, sees a felmeddelande, and is offered to request a new inloggningskod; entering the correct code afterwards still logs him in

- **S07 [OC03] Inloggningskod äldre än 10 minuter nekas**
  - **Given** Kalle requested an inloggningskod at 12:00:00 by the Clock
  - **When** he enters it correctly at 12:10:00
  - **Then** he is logged in
  - **When** instead he enters it correctly at 12:10:01
  - **Then** he is not logged in, sees a felmeddelande saying the inloggningskod has expired, and is offered to request a new one

- **S08 [OC03] Ny inloggningskod på begäran ersätter den gamla**
  - **Given** Kalle requested inloggningskod A, and A has expired or he entered a wrong code
  - **When** he requests a new inloggningskod
  - **Then** a new six-digit inloggningskod B is shown in the "Simulerat SMS" box with a fresh 10-minute validity from the Clock's now; B logs him in, and A no longer does

- **S09 [OC03] En använd inloggningskod fungerar inte igen**
  - **Given** Kalle logged in with inloggningskod A
  - **When** A is submitted again for 0707654321, from the same or another browser session
  - **Then** no session is created and a felmeddelande is shown

- **S10 [OC03] [runtime] Felvägen i webbläsaren: fel kod, ny kod, inloggad**
  - **Given** the app started with README's start command, at a 360 px wide viewport
  - **When** Kalle requests an inloggningskod, enters a wrong one, uses the offered "Begär ny inloggningskod", and enters the new code from the "Simulerat SMS" box
  - **Then** he first sees the felmeddelande with the offer, then a different code in the box, then is logged in
  - **Proof**: `e2e/auth.spec.ts#wrong code then new code logs in` – red at spec time


## Structural Criteria

- **SC01** Inloggning, kontoskapande and the inloggningskod step have no horizontal scroll at 360 px width (PRD NFR Usability).
- **SC02** The mobilnummer is stored only in its normalized form `07XXXXXXXX`, so one person never has two accounts through different spellings of the same number.


## Scope & Boundaries

### Work Areas
- `src/domain/` auth module from story S01 – mobilnummer validation and normalization, kontoskapande, inloggningskod issue, replace, expiry and single use
- `src/app/` – inloggning page and its server actions, new kontoskapande page, inloggningskod step with "Begär ny inloggningskod"
- `src/db/` schema – only if story S01's inloggningskoder table lacks an issued-at or used marker
- `tests/auth/`, `e2e/auth.spec.ts`

### What We're NOT Doing
- Attempt limits, lockout or rate limiting of inloggningskoder – a local course prototype with a handful of demo users (`docs/PRODUCT.md#proportionality`); the simulated SMS shows any number's inloggningskod on screen by design.
- Utloggning, profile editing and changing name or mobilnummer – not in FR1; the PRD excludes profile editing beyond names at kontoskapande.
- Real SMS – a standing technical non-goal; `SmsSender`'s simulated implementation from story S01 stays the only one.
- The sökning-specific hint for visitors without a session – story S04.
- PRD Edge Cases rows and NFR-Security's code-exposure and authorization rows – none concerns inloggning; owned by stories S01 and S03–S07 (narrowing note for the Edge-Cases and NFR-Security binding constraints). NFR-Reliability: no status transitions here.


## Architecture Decision

**Approach**: Extend story S01's auth domain functions and pages in place: one `normalizeMobileNumber` used by both request-code and kontoskapande, the inloggningskod row carrying issued-at from `Clock` and a used marker, and a new request replacing any open code for the number. The pending number travels between steps in the URL or form, never a client-trusted user id.
**Why this over the floor**: the floor is story S01's registered-number-only login; FR1's criteria for kontoskapande, wrong/expired code, invalid number and the two hänvisningar rule it out.


## Constraints & Gotchas

- **Constraint**: marking a code used and creating the session must not race two submissions of the same code into two sessions. – Workaround: mark used with a conditional UPDATE (`used_at IS NULL`) counting affected rows, inside the same synchronous Drizzle transaction as the session insert (story S01's Constraints on synchronous transactions apply).


## Implementation Plan

### Implementation Tasks

- **TI01** One `normalizeMobileNumber` accepts `07` + 8 digits or `+46`/`0046` + `7` + 8 digits, ignoring spaces and dashes, returns `07XXXXXXXX` or a validation error, and is the only path by which a mobilnummer reaches storage or lookup.
  - **Verify**: `tests/auth/mobile-number.test.ts#normalizes swedish mobile numbers and rejects others` – every accepted and refused value of scenario S04; plus `tests/auth/sign-up.test.ts#spelling variants map to one account` – sign-up with "+46 73 987 65 43" stores 0739876543, and requesting a code with "073-987 65 43" finds that same account
  - **SATISFIES**: S04, SC02

- **TI02** Requesting an inloggningskod for a valid unregistered number sends nothing and returns a hänvisning to kontoskapande with the number; for an invalid number it returns a felmeddelande and sends nothing.
  - Depends on TI01.
  - **Verify**: `tests/auth/request-code.test.ts#unregistered number is referred to sign-up with number` – asserts the simulated SMS outbox stays empty and the result carries 0739876543; `tests/auth/request-code.test.ts#invalid number is refused`
  - **SATISFIES**: S02, S04

- **TI03** Kontoskapande creates a user with role användare and trimmed names and sends an inloggningskod; it refuses empty names and invalid numbers, and for an existing number returns a hänvisning to inloggning with the number, changing nothing.
  - Depends on TI01.
  - **Verify**: `tests/auth/sign-up.test.ts#creates account and sends login code` – plus `#refuses missing names`, `#existing number is referred to login unchanged`, each asserting user count and outbox
  - **SATISFIES**: S01, S03, S05

- **TI04** Verifying an inloggningskod logs in only when it matches the number's open code, its age by the Clock is at most 10 min (config from story S01), and it is unused; a success marks it used and creates the session atomically per Constraints; every refusal returns a felmeddelande, distinguishing expired, and offers a new code.
  - **Verify**: `tests/auth/login.test.ts#wrong code is refused and offers new code` – also asserts the correct code still logs in afterwards (scenario S06's last clause); plus `#code valid at exactly 10 minutes and refused one second later` with the fixed Clock, `#used code cannot log in again`, each asserting the sessions table count
  - **SATISFIES**: S06, S07, S09

- **TI05** Requesting a new inloggningskod issues a fresh six-digit code with issued-at = Clock now and invalidates any earlier open code for the number.
  - **Verify**: `tests/auth/login.test.ts#new code replaces the old one` – A refused and B accepted after the new request, both from the outbox
  - **SATISFIES**: S08

- **TI06** The inloggning page, a new kontoskapande page reachable from it, and the inloggningskod step show each refusal's felmeddelande, prefill the number on each hänvisning, and offer "Begär ny inloggningskod"; the new code shows in the "Simulerat SMS" box.
  - Depends on TI02–TI05. Follow the copy and layout of the prototype's `vLogin`.
  - **Verify**: `e2e/auth.spec.ts#new user creates account and logs in` – scenario S01 end to end; `e2e/auth.spec.ts#wrong code then new code logs in` – scenario S10; `e2e/auth.spec.ts#wrong entry points refer with number filled` – scenarios S02 and S03 in the browser; each test asserts `scrollWidth <= clientWidth` on every visited step at 360×800
  - **SATISFIES**: S01, S02, S03, S10, SC01


## Settled Decisions

- A valid Swedish mobilnummer is `07` + 8 digits, also written `+46 7…` or `0046 7…`, with spaces and dashes ignored, and is stored normalized as `07XXXXXXXX`.
- "Inom 10 minuter" includes exactly 10:00 and refuses from 10:01.
- A wrong inloggningskod does not invalidate the open code, so the user can retry it within its validity.
- Requesting a new inloggningskod invalidates the earlier one.
- An unregistered number at inloggning gets no inloggningskod until kontoskapande is submitted, and an existing number at kontoskapande gets no automatic inloggningskod, only the hänvisning.
- Kontoskapande is its own page reachable from inloggning as well as the target of scenario S02's hänvisning, since FR1 treats it as a separate entry point.


## Discovered Requirements

- **Title**: The "Simulerat SMS" box shows any registered number's inloggningskod
  - **Description**: S01's `/logga-in/kod?mobil=<nummer>` page shows the latest simulated SMS for whatever number the URL names, without a session. Anyone can read anyone's inloggningskod and log in as them. `DEMO_MODE=false` does not hide the box.
  - **Rationale**: FR1 and FR10 require the code to be visible in a box labelled "Simulerat SMS". Neither says who may see the box.
  - **Interpretation**: accepted as inherent to the simulated SMS in a course demo. Keep the box, but if this story touches the page, show only the SMS from the request the same browser just made (for example tied to a cookie set by the request action), not any number's latest.
  - **Traced from**: S01/TI06 (review finding N3)
  - **Date**: 2026-11-17


## Implementation Observations

- **TI05 reading, no schema change**: "the number's open code" is read as the number's latest issued inloggningskod. `logIn` checks only that row (match, unused, age ≤ validity), so a new request invalidates every earlier code without an extra column; `login_codes` already had `created_at` and `used_at`, so `src/db/` is untouched.
- **Expired takes precedence**: when the latest code is past its validity, the refusal says it has expired whatever was typed, since a new inloggningskod is needed either way.
- **Discovered Requirement implemented**: the request and kontoskapande actions set an httpOnly `login_sms` cookie with the outbox id of the SMS they sent; `/logga-in/kod` shows only that SMS, and only when its number matches the URL. Proved by the stranger-browser check in `e2e/auth.spec.ts#wrong code then new code logs in`. The cookie value is a sequential id, so a hand-forged cookie could still read another SMS; accepted for the simulated SMS, where anyone may request a code for any number anyway.
- **Visual validation P2 fixed**: a refused form lost what the user typed (React 19 resets a form after its `action`). `src/components/action-form.tsx` now submits through `onSubmit` with `startTransition`, keeping `action` for no-JS posts; this applies to every `ActionForm` (also S01's publish and purchase forms). Regression guard: `e2e/auth.spec.ts#wrong entry points refer with number filled` asserts the refused number stays in the field.
- NOTICED BUT NOT TOUCHING (review, LOW, code-defect): `src/server/actions/auth.ts` `follow()` reads `latestSimulatedSms(db, phone)` after sending, so two near-simultaneous requests for one number could put the other browser's SMS id in the cookie. Remedy: have `SmsSender.send` return the outbox id (changes S01's adapter contract). Routing: Note.
- NOTICED BUT NOT TOUCHING (review, LOW, code-defect, confidence 50): two simultaneous kontoskapande for one number could hit the `users.phone` unique constraint and give a 500 instead of the hänvisning. `signUp` has no await between check and insert, so within one Node process it cannot interleave. Routing: Note.
- NOTICED BUT NOT TOUCHING (review, LOW, design): `src/app/logga-in/mobile-param.ts` is also imported by `src/app/skapa-konto/page.tsx`; a shared spot such as `src/app/_lib/` would fit better. Routing: Note.
- NOTICED BUT NOT TOUCHING (visual, P3): the header is ~6 px taller with the back arrow (`AppFrame`), so content shifts between /logga-in and /skapa-konto; the code in the "Simulerat SMS" box is plain text where the prototype shows bold monospace; refusal notes sit under the submit button where the prototype puts them above it; /skapa-konto has no subtitle. Routing: Note.
- Glossary: rows for Mobilnummer, Kontoskapande and Hänvisning added to `docs/UBIQUITOUS_LANGUAGE.md` (review finding).
- The conditional `used_at IS NULL` UPDATE guard in `logIn` has no dedicated test: `logIn` is synchronous on better-sqlite3, so two submissions cannot interleave in-process; the guard is defensive per Constraints.
