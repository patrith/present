# ADR-005: Simulerbar klocka, kontroll vid anrop och periodiskt svep

## Status
Accepted

## Context
Flera regler beror på tid: reservationen på 5 minuter (FR5), annonsens utgång efter giltighetsdagen (FR8) och reklamationsperioden på 24 timmar (FR6). Demoläget ska ha en simulerad klocka som kan flyttas fram, så att tidsberoende scenarier kan visas i en tvåminutersdemo (FR10), och testerna ska vara deterministiska.

## Decision
All kod läser tiden via ett injicerat `Clock`-gränssnitt (`now()`). Vid vanlig körning returnerar det systemtid. I demoläge och i tester används en flyttbar klocka. Tidsberoende övergångar görs av en idempotent funktion `expireDue(now)` som anropas (1) innan varje läsning eller ändring av berörda annonser och köp, (2) av ett svep varje sekund som startas en gång i `instrumentation.ts`, och (3) direkt när demoklockan flyttas. Funktionen använder övergångarna från ADR-003, så samtidiga anrop är ofarliga.

## Consequences
- Lättare: deterministiska tester utan att vänta på riktig tid. Demon kan visa utgång och reklamationsperiod på sekunder. Statusen är korrekt även när ingen tittar.
- Svårare: svepet måste skyddas mot dubbelstart vid hot reload i dev (t.ex. en flagga på `globalThis`). Ingen kod får läsa `Date.now()` direkt, vilket bör upprätthållas i granskning eller med en lint-regel.

**Reversal**: two-way door – svepet kan tas bort eller ersättas av en schemaläggare utan att domänlogiken ändras.

## Alternatives Considered
1. **Bara kontroll vid anrop** – rejected: statusen ändras först när någon tittar, så till exempel säljarens saldo uppdateras inte av sig själv.
2. **Jobbschemaläggare (ett jobb per händelse)** – rejected: svårt att få att följa en simulerad klocka, och det går utöver vad prototypen behöver.
3. **Floor option – systemtid och ingen simulerad klocka** – rejected: utgång och reklamationsperiod går då inte att demonstrera eller testa deterministiskt.

## Implementation Notes
- Demoklockan styrs via en tydligt märkt demopanel ("Simulerad tid") som bara finns i demoläge.
- Tidszon för giltighetsdatum: Europe/Stockholm, dagens slut.

## Project Compliance
Uppfyller PRD:ns FR10 (simulerad klocka i demoläge) och beslutet om utgång i kravdokumentets beslutslogg.

## References
- `docs/specs/applikation-for-kop-och-salj-av/prd.md` FR5, FR6, FR8, FR10
- ADR-003
