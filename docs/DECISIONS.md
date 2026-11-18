# Decisions

<!-- One Current ADRs row per ADR, keyed on its ID; the `andthen:decide` skill writes them.
     Status: Proposed | Accepted | Deprecated. A superseded row moves to Superseded; a rejected
     ADR leaves the index, and its file keeps the record. -->

## Current ADRs

| ID | Title | Status | Scope |
|----|-------|--------|-------|
| [ADR-001](adrs/ADR-001-typescript-nextjs-sammanhallen-app.md) | TypeScript och Next.js som en sammanhållen webbapp | Accepted | Språk, ramverk och appform |
| [ADR-002](adrs/ADR-002-sqlite-drizzle.md) | SQLite i fil via Drizzle ORM | Accepted | Datalagring |
| [ADR-003](adrs/ADR-003-atomara-statusovergangar.md) | Atomära och idempotenta statusövergångar via villkorad UPDATE | Accepted | Reservation, betalningsbesked, avslut |
| [ADR-004](adrs/ADR-004-vitest-playwright.md) | Vitest för domän- och integrationstester, Playwright för end-to-end | Accepted | Testramverk |
| [ADR-005](adrs/ADR-005-klocka-och-svep.md) | Simulerbar klocka, kontroll vid anrop och periodiskt svep | Accepted | Tidsstyrda regler och demoklocka |

## Superseded

<!-- Never delete a superseded row: its lineage tells agents why the code is shaped as it is. -->

| Prior Decision | Superseded By | Notes |
|----------------|---------------|-------|

## Still Current

<!-- Load-bearing choices that don't warrant an ADR, one bullet each:
     `- **<Topic>**: <decision + brief rationale>`. State each as it holds now, rewriting or
     deleting it when a later choice changes it; promote a contested one to an ADR. -->

- **Simulerade integrationer**: betalning, butikskontroll och SMS ligger bakom utbytbara adaptrar (`PaymentProvider` med authorize/capture/void/refund, `GiftCardVerifier`, `SmsSender`) med deterministiska simulerade implementationer. Briefen kräver simulering, och adaptrarna gör simulatorerna styrbara i tester och utbytbara mot riktiga tjänster.

## Pending

<!-- Decisions under discussion, not yet accepted. -->

- Inga.
