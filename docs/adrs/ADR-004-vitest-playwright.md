# ADR-004: Vitest för domän- och integrationstester, Playwright för end-to-end

## Status
Accepted

## Context
Definitionen av klart kräver ett demoflöde, relevanta feltester och reproducerbar körning. Kravdokumentet sätter målen 7 av 7 prioriterade felscenarier automattestade och 0 dubbelförsäljningar i ett samtidighetstest.

## Decision
Vitest används för domän- och integrationstester mot en riktig SQLite-databas per testkörning, inklusive samtidighetstestet och alla felscenarier. Simulatorerna och klockan injiceras med deterministiska utfall. Playwright kör demoflödet (publicera → hitta → köpa → se kod och status) och minst ett felflöde end-to-end i webbläsaren mot den startade appen. Båda körs via npm-skript som README dokumenterar: en snabb nivå (Vitest) och en full nivå (Vitest + Playwright).

## Consequences
- Lättare: snabba tester i TypeScript-ekosystemet utan extra konfiguration för ESM och TS. Demoflödet bevisas i en riktig webbläsare.
- Svårare: Playwright laddar ner webbläsare (`npx playwright install`), vilket README måste ange. End-to-end-tester är långsammare och körs i den fulla nivån.

**Reversal**: two-way door – testramverk kan bytas med måttlig insats. Testfallen och scenarierna består.

## Alternatives Considered
1. **Jest + Playwright** – rejected: likvärdigt, men kräver mer konfiguration för TS och ESM.
2. **Floor option – bara Vitest** – rejected: demoflödet och gränssnittets märkning av simuleringar bevisas då inte end-to-end.

## Implementation Notes
- Kommandona för `fast`, `full` och att köra ett enskilt test registreras i `Key Dev Commands` när projektet har ett manifest.
- E2E-tester startar appen i demoläge med en ny databas och en flyttbar klocka (ADR-005).

## Project Compliance
Stödjer kravdokumentets mätbara mål och NFR Reproducibility.

## References
- ADR-003, ADR-005
