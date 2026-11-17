# Presentkortsmarknaden

En prototyp av en marknadsplats där privatpersoner säljer oanvända presentkort med rabatt. Betalning, SMS och butikskontroll är **simulerade** och märkta som det i gränssnittet. Krav: `docs/specs/applikation-for-kop-och-salj-av/prd.md`.

## Förutsättningar

- Node.js 24 LTS och npm
- Installera beroenden: `npm ci`
- Webbläsare för end-to-end-testerna (en gång): `npx playwright install chromium`

## Starta demon

```sh
npm run dev
```

Öppna <http://localhost:3000>. Kommandot startar appen i **demoläge**: databasen (`data/demo.db`) raderas, skapas om och fylls med handlare, testanvändare, en demoadministratör och fyra aktiva annonser. Allt som hänt i en tidigare körning försvinner.

Inställningar via miljövariabler:

| Variabel | Standard | Betydelse |
|----------|----------|-----------|
| `RESERVATION_MINUTES` | `5` | Reservationstid för en annons under köp |
| `CLAIM_PERIOD_HOURS` | `24` | Reklamationsperiod efter leverans |
| `LOGIN_CODE_MINUTES` | `10` | Hur länge en inloggningskod gäller |
| `VERIFIER_TIMEOUT_SECONDS` | `5` | Hur länge butikskontrollen (vid publicering, ändring och köp) får ta innan den räknas som inget svar |
| `DEMO_MODE` | på | `false` stänger av demoläget (systemklocka i stället för simulerad klocka) |
| `DATABASE_PATH` | `data/demo.db` | Databasfilen |

## Testanvändare

Logga in med mobilnumret. Inloggningskoden visas i rutan **Simulerat SMS** och gäller i 10 minuter; **Begär ny inloggningskod** ersätter den. Ett nytt konto skapas under **Skapa konto** med mobilnummer, förnamn och efternamn.

| Namn | Mobilnummer | Roll |
|------|-------------|------|
| Sara Lind | 0701234567 | Användare (säljare i demoflödet; äger de fyra förinlagda annonserna) |
| Kalle Berg | 0707654321 | Användare (köpare i demoflödet) |
| Lisa Ek | 0731112233 | Användare |
| Demo Admin | 0700000000 | Demoadministratör |

Förinlagda annonser (alla Saras, koder som börjar med `SEED`): Åhléns, Filmstaden, Clas Ohlson och ICA. Ingen ligger hos Nordiska Kompagniet, så demoflödets NK-kort blir det enda där.

## Simulerad butikskontroll

Butikskontrollen svarar deterministiskt efter presentkortskodens början (skiftlägesokänsligt), både vid publicering och vid köp:

| Koden börjar med | Vid publicering | Vid köp |
|------------------|-----------------|---------|
| `OGILTIG` | Ogiltig | Ogiltig |
| `ANVAND` | Giltig | Ogiltig (säljaren har använt kortet) |
| `DELVIS` | Giltig med uppgivet saldo | Giltig, saldo 200 kr lägre |
| `SALDO` | Giltig, kontrollerat saldo 800 kr | Giltig, kontrollerat saldo 800 kr |
| `TIMEOUT` | Inget svar | Inget svar |
| `FEL` | Fel | Fel |
| allt annat | Giltig med uppgivet saldo | Giltig med uppgivet saldo |

Den simulerade betalningen auktoriseras eller nekas enbart efter köparens val i steget **Simulerad betalning** (**Godkänn** eller **Neka betalningen**).

Vid köp släpps auktoriseringen och köpet blir Misslyckat om kontrollen inte svarar giltig med minst annonsens saldo: `ANVAND` och `DELVIS` gör annonsen Flaggad (ogiltig kod respektive saldoavvikelse), `TIMEOUT` och `FEL` gör den Aktiv igen. En reservation som löper ut före leverans gör köpet Misslyckat och annonsen Aktiv, även om ingen sida är öppen.

## Demoflödet

1. Logga in som Sara, välj **Sälj** och publicera ett kort hos Nordiska Kompagniet, t.ex. koden `NK-4471-9920`, saldo 1 000 kr, pris 850 kr.
2. Logga in som Kalle i ett annat webbläsarfönster (t.ex. privat läge), filtrera på Nordiska Kompagniet under **Erbjudanden**, öppna annonsen (15 % rabatt) och köp den.
3. Godkänn den simulerade betalningen. Kalle ser koden, statusen Levererat och kvittot, och trycker **Kortet fungerade**.
4. Sara ser annonsen som Såld och sitt utbetalningssaldo 850 kr under **Mina kort**; Kalle ser köpet Avslutat med koden och, när han öppnar köpet, dess statushistorik.

## Demopanelen och den simulerade klockan

I demoläge visar varje sida demopanelen **Simulerad tid** överst: den simulerade tiden (svensk tid), knapparna **+1 min**, **+5 min** och **+1 dag** och de inställda tiderna för reservation och reklamationsperiod. En knapptryckning flyttar den simulerade klockan framåt och tillämpar direkt alla tidsregler mot den nya tiden: en reservation som löpt ut gör köpet Misslyckat och annonsen Aktiv, en reklamationsperiod som löpt ut gör köpet Avslutat och krediterar säljaren, och en annons vars giltighetsdatum passerat blir Utgången. Klockan går bara framåt och nollställs när appen startas om. Med `DEMO_MODE=false` visas ingen panel.

## Simulerade element (FR10)

Allt simulerat är märkt i gränssnittet:

| Element | Märkning |
|---------|----------|
| Inloggningskoden | **Simulerat SMS** |
| Butikskontrollen som godkänt en annons | **Kontrollerad (simulerat)** |
| Butikskontrollens avslag vid publicering eller ändring, och ett köp som misslyckas i kontrollen | **Simulerad butikskontroll** |
| Betalsteget | **Simulerad betalning** |
| Återbetalningen efter en beviljad reklamation | **Simulerad återbetalning** |
| Säljarens utbetalningssaldo under Mina kort | **Simulerad utbetalning** |
| Demopanelens klocka | **Simulerad tid** |

## Prioriterade felscenarier

De sju prioriterade felscenarierna (PRD:ns Edge Cases) och testerna som täcker dem. Alla körs av `npm test` (och `npm run test:full`); ett enskilt test körs med `npx vitest run {fil} -t "{test}"`.

| # | Felscenario | Testfil | Test |
|---|-------------|---------|------|
| 1 | Två köpare reserverar samma annons samtidigt – bara en lyckas | `tests/purchases/reserve.test.ts` | `concurrent, repeated and own-listing reservations` |
| 2 | Betalningsauktorisering nekas – ingen kod levereras, annonsen blir Aktiv igen | `tests/purchases/payment.test.ts` | `declined payment fails purchase and reactivates listing` |
| 3 | Kortets giltighetstid passerar under köpet | `tests/purchases/validity-at-delivery.test.ts` | `expired card is never delivered` |
| 4 | Kontrollen anger lägre saldo än annonsen | `tests/purchases/verifier-outcomes.test.ts` | `ANVAND DELVIS TIMEOUT FEL each fail without capture` |
| 5 | Samma betalningsbesked tas emot två gånger – ingen dubbel leverans eller dragning | `tests/purchases/payment-callback.test.ts` | `duplicate besked sequential and concurrent capture once` |
| 6 | Säljaren försöker ändra pris eller kod när annonsen är Reserverad | `tests/listings/edit-guards.test.ts` | `no change while reserved or after` |
| 7 | Köparen rapporterar ogiltig kod efter leverans – tvist utan automatisk återbetalning | `tests/purchases/claim.test.ts` | `claim opens dispute and refusals change nothing` |

## Tester

| Nivå | Kommando | Innehåll |
|------|----------|----------|
| Snabb | `npm test` | Vitest: domän- och integrationstester mot en egen SQLite-databas per testfil |
| Full | `npm run test:full` | Vitest och sedan Playwright end-to-end mot appen startad med `npm run dev` (port 3100, databas `data/e2e.db`) |

End-to-end-specarna delar en app och en databas och körs i en worker; `e2e/demo-clock.spec.ts`, som flyttar den simulerade klockan, ligger i ett eget Playwright-projekt som körs sist.

Bara end-to-end: `npm run test:e2e`. Typkontroll: `npm run typecheck`.

Kör ett enskilt test:

```sh
npx vitest run tests/purchases/purchase.test.ts -t "approved payment and valid check deliver the code"
npx playwright test e2e/demo-flow.spec.ts -g "demo flow publish find buy see code"
```
