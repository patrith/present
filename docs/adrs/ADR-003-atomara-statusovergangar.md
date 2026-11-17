# ADR-003: Atomära och idempotenta statusövergångar via villkorad UPDATE

## Status
Accepted

## Context
Kravdokumentet kräver att exakt en av två samtidiga köpare får reservationen (FR5), att ett dubblerat betalningsbesked inte ger dubbel dragning eller leverans (FR5), att ett avslut krediterar säljaren bara en gång (FR6) och att alla statusändringar är spårbara (NFR Traceability). Handledarbilagan föreslår atomär reservation i databasen och ett test med två samtidiga anrop.

## Decision
Varje statusövergång för annons och köp skrivs som en villkorad UPDATE på föregående status, till exempel `UPDATE listings SET status = 'Reserverad', reserved_by = ?, reserved_until = ? WHERE id = ? AND status = 'Aktiv'`. Övergången räknas som genomförd bara om exakt en rad påverkades. Annars returneras ett domänfel ("redan reserverad", "redan behandlad"). Övergången och raden i statushistoriken skrivs i samma transaktion. Ett andra försök till samma övergång påverkar noll rader och blir därmed en no-op, vilket ger idempotens för dubblerade betalningsbesked och avslut.

## Consequences
- Lättare: databasen garanterar att bara en vinner, även om flera processer eller förfrågningar körs samtidigt. Samtidighetstestet blir enkelt att skriva.
- Lättare: idempotens behöver ingen separat nyckeltabell. Tillåtna övergångar blir explicita i koden.
- Svårare: varje övergång måste skrivas med sitt statusvillkor. En övergång som glöms bort att villkoras blir en lucka, så tester täcker varje tillåten övergång.

**Reversal**: one-way door för korrektheten – att ersätta mönstret med lås i processen skulle ta bort garantin. Att byta till en versionskolumn är möjligt men kräver att alla övergångar skrivs om.

## Alternatives Considered
1. **Optimistisk samtidighetstoken (versionskolumn)** – rejected: också korrekt, men mer kod per övergång och felhantering via undantag.
2. **Lås i processen (mutex)** – rejected: gäller bara inom en process och bevisar inte databasgarantin.
3. **Floor option – läs status, kontrollera, skriv** – rejected: har ett race mellan läsning och skrivning, vilket är precis det felscenario kravet ska förhindra.

## Implementation Notes
- En gemensam hjälpfunktion, t.ex. `transition(table, id, from, to, extra)`, gör den villkorade uppdateringen, kontrollerar antalet påverkade rader och skriver statushistoriken i samma transaktion.
- Samtidighetstestet startar två reservationer parallellt mot samma annons och kontrollerar att exakt en lyckas och att det finns exakt ett köp med status Påbörjat.

## Project Compliance
Uppfyller PRD:ns NFR Reliability (0 dubbelförsäljningar, 0 dubbla dragningar/krediteringar) och Traceability.

## References
- `docs/specs/applikation-for-kop-och-salj-av/prd.md` FR5, FR6, FR7
- ADR-002
