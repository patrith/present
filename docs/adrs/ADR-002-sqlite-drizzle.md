# ADR-002: SQLite i fil via Drizzle ORM

## Status
Accepted

## Context
Prototypen behöver riktiga transaktioner och villkorade uppdateringar för att bevisa att samma annons aldrig säljs två gånger (PRD FR5, NFR Reliability). Den körs lokalt med bara demodata som återskapas vid start (`docs/PRODUCT.md`). Reproducerbar körning utan extra infrastruktur är en del av definitionen av klart.

## Decision
Data lagras i SQLite i en fil, åtkommen via Drizzle ORM med drivrutinen better-sqlite3. Schemat definieras i Drizzle, och databasen skapas om och fylls med demodata vid start i demoläge. Tester använder en egen databas per testkörning.

## Consequences
- Lättare: ingen databasserver eller Docker. `npm install` räcker. Typade frågor och migreringar via Drizzle Kit.
- Lättare: riktiga ACID-transaktioner och villkorad UPDATE med antal påverkade rader (ADR-003).
- Svårare: SQLite serialiserar skrivningar, vilket är oväsentligt i prototypens skala. better-sqlite3 är en native-modul som kräver en byggbar Node-miljö (förbyggda binärer finns för vanliga plattformar).
- Svårare: ett byte till PostgreSQL senare kräver ny drivrutin och kontroll av SQL-dialekten.

**Reversal**: two-way door – Drizzle stöder PostgreSQL. Ett byte är ett avgränsat arbete i datalagret om domänlogiken inte använder SQLite-specifika funktioner.

## Alternatives Considered
1. **PostgreSQL i Docker** – rejected: produktionslik, men kräver Docker för körning och test, vilket går utöver vad prototypen behöver (`docs/PRODUCT.md`).
2. **Prisma** – rejected: bekvämt schema, men tyngre verktygskedja (genererad klient) och mindre direkt kontroll över villkorade uppdateringar.
3. **Rå SQL med better-sqlite3** – rejected: minst beroenden, men inga typade frågor och ingen migrering utan eget arbete.
4. **Floor option – lagring i processens minne** – rejected: atomiciteten gäller bara inom en process och data försvinner vid omstart. SQLite ger en trovärdig databasgaranti för nästan samma kostnad.

## Implementation Notes
- Databasfilen ligger utanför versionshanteringen (t.ex. `data/*.db` i `.gitignore`).
- Demodata (handlare, testanvändare, demoadministratör, annonser) skapas av ett seed-skript som README dokumenterar.

## Project Compliance
Följer Proportionality i `docs/PRODUCT.md`: lokal körning, demodata som nollställs vid start.

## References
- ADR-001, ADR-003
