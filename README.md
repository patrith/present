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

Den simulerade betalningen auktoriseras eller nekas enbart efter köparens val i steget **Simulerad betalning**.

## Demoflödet

1. Logga in som Sara, välj **Sälj** och publicera ett kort hos Nordiska Kompagniet, t.ex. koden `NK-4471-9920`, saldo 1 000 kr, pris 850 kr.
2. Logga in som Kalle i ett annat webbläsarfönster (t.ex. privat läge), öppna annonsen under **Erbjudanden** och köp den.
3. Godkänn den simulerade betalningen. Kalle ser koden, statusen Levererat och kvittot; Sara ser annonsen som Såld under **Mina kort**.

## Tester

| Nivå | Kommando | Innehåll |
|------|----------|----------|
| Snabb | `npm test` | Vitest: domän- och integrationstester mot en egen SQLite-databas per testfil |
| Full | `npm run test:full` | Vitest och sedan Playwright end-to-end mot appen startad med `npm run dev` (port 3100, databas `data/e2e.db`) |

Bara end-to-end: `npm run test:e2e`. Typkontroll: `npm run typecheck`.

Kör ett enskilt test:

```sh
npx vitest run tests/purchases/purchase.test.ts -t "approved payment and valid check deliver the code"
npx playwright test e2e/demo-flow.spec.ts -g "demo flow publish find buy see code"
```
