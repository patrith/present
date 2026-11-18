# Product Requirements Document: Presentkortsmarknaden – MVP

> **Shipped**: 2026-11-18T01:01Z
> **Source**: inline:sha256:79af29f612d2
> **Context**: Kursens case "Presentkortsmarknaden" (IT-Huset, Spec Driven Development / Agentic Engineering). Underlag: `docs/requirements/Kundcase_Presentkortsmarknaden.pdf`.
> **Related Assets**: Designreferens (stil, ej bindande): `docs/requirements/Presentkortsapp.pdf` och Figma-prototypen https://www.figma.com/proto/sw7vtcUOgtV2veaRYl8UfP/Presentkortsapp?node-id=0-1


## Executive Summary

- **Problem**: Presentkort blir liggande och tappar värde, och en köpare som står i kassan har inget sätt att hitta ett rabatterat kort för just den butiken (briefens hypotes: en betydande andel används aldrig – overifierad).
- **Vision**: En demonstrerbar marknadsplats där en säljare publicerar ett kort med rabatt och en köpare hittar, köper och får tillgång till koden på några sekunder – med korrekt status, utan dubbelförsäljning och med tydligt markerade simuleringar.
- **Target Users**: Säljare (privatperson med outnyttjat presentkort) och Köpare (privatperson som vill ha rabatt när köpbehovet uppstår); en Demoadministratör avgör tvister.
- **Success Metrics**: demoflödet genomförs på ≤ 2 min · 0 dubbelförsäljningar i samtidighetstestet · samtliga 7 prioriterade felscenarier automattestade och gröna · 100 % av simulerade steg synligt märkta.

### Capabilities at a Glance

- **FR1: Inloggning med simulerad SMS-kod** _(Must / P0)_ – konto och inloggning med mobilnummer och engångskod som visas som simulerat SMS.
- **FR2: Publicera annons** _(Must / P0)_ – säljaren anger handlare, kod, saldo, giltighet och pris; simulerad kontroll innan annonsen blir aktiv.
- **FR3: Hantera egen annons** _(Must / P0)_ – ändra pris eller kod, rätta en flaggad annons, återkalla – bara i tillåtna statusar.
- **FR4: Sök och jämför erbjudanden** _(Must / P0)_ – lista aktiva annonser, filtrera på handlare, sortera på rabatt, pris och giltighet.
- **FR5: Köp med reservation, auktorisering och leverans** _(Must / P0)_ – atomär reservation i 5 min, simulerad auktorisering, ny kontroll, dragning och leverans av koden.
- **FR6: Affärens avslut och säljarens utbetalning** _(Must / P0)_ – affären avslutas vid köparens bekräftelse eller efter reklamationsperioden; säljarens simulerade saldo krediteras.
- **FR7: Reklamation och tvist** _(Must / P0)_ – köparen rapporterar ogiltig kod, utbetalningen fryses, demoadministratören beslutar återbetalning eller avslag.
- **FR8: Utgång av annonser** _(Must / P0)_ – automatisk utgång efter giltighetsdagen, varning under 7 dagar, avbrutet köp om giltigheten passerar.
- **FR9: Mina kort** _(Must / P0)_ – säljarens annonser och försäljningar, köparens köpta kort med kod och status.
- **FR10: Märkning av simulering och demoläge** _(Must / P0)_ – varje simulerat steg är synligt märkt; demoläge kortar tider för demonstration.

### Scope Highlights
- **In scope**: inloggning, publicering med simulerad kontroll, sök/filter, köp med reservation och simulerad betalning, status och kodåtkomst, avslut/utbetalning (simulerad), tvist, utgång.
- **Out of scope**: riktig betalning och utbetalning, riktiga SMS, butiksintegration, presentkortsplånbok, gåvofunktion, "bjud in en vän", profilredigering utöver namn.
- **MVP boundary**: en säljare publicerar, en köpare köper och ser koden, och minst ett fel- eller konkurrensscenario visas – lokalt körbart med ett kommando.

### Key Constraints, Assumptions & Dependencies
- *Constraint:* betalning, SMS och butikskontroll simuleras och ska tydligt framgå som simulerade.
- *Assumption:* en reservation i vår tjänst hindrar inte säljaren från att använda originalkoden i butiken; ett tidigare saldobesked garanterar inte saldot vid inlösen – därför reklamation och tvist.
- *Constraint:* prototyp för kursdemo, lokal körning, ingen produktionsdrift.


## Problem Definition

### Problem Statement
Privatpersoner har presentkort som aldrig används och därmed förlorar sitt värde. Samtidigt saknar den som ska handla i en butik ett sätt att i stunden hitta ett rabatterat presentkort för just den butiken. En marknadsplats mellan dem kräver förtroende: köparen måste förstå giltighet och risk, säljaren måste få betalt tryggt, och samma kort får aldrig säljas två gånger. Utan en trovärdig strategi för verifiering, betalning och misslyckade affärer går idén inte att pröva.

### Target Users
- **Säljare** – har ett outnyttjat presentkort; vill registrera det, sätta ett pris och få betalt på ett tryggt sätt.
- **Köpare** – står ofta i eller nära en butik inför betalning; vill hitta rabatt, förstå giltighet och risk, köpa snabbt och kunna använda koden direkt.
- **Demoadministratör** – en förinlagd roll i prototypen som avgör tvister.

### Desired Outcome
Det går att visa, på två minuter, att en säljare kan publicera ett kort, att en köpare kan hitta och köpa det och omedelbart se koden, och att tjänsten håller rätt status genom hela affären – även när betalningen nekas, saldot inte stämmer, kortet går ut eller två köpare försöker samtidigt. Den som ser demon förstår exakt vilka delar som är verklig logik och vilka som är simulerade. Plånbok och gåvor från Figma finns inte kvar som separata funktioner; användaren ser bara "mina kort" i marknadsplatsens mening.

### Evidence & Context
- Briefens exempel: kunden ska handla för 1 000 kr och hittar ett kort med motsvarande värde för 850 kr.
- Figma-underlaget visar främst en plånbok; marknadsplats, annonser, kassa och transaktionsstatus finns inte som färdiga flöden (handledarbilaga A).
- Antagandet att en stor andel kort aldrig används är en hypotes, inte ett verifierat faktum (bilaga I).
- Definition av klart enligt briefen: demoflöde, relevant feltest, reproducerbar körning och dokumenterade avgränsningar.


## Success Metrics

| Metric | Baseline | Target | How observed |
|--------|----------|--------|--------------|
| Tid för demoflödet publicera → hitta → köpa → se kod och status | unknown (ingen app finns) | ≤ 2 min, utan manuella ingrepp i data | Genomförd demo med klocka vid kursens redovisning |
| Dubbelförsäljningar när två köpare reserverar samma annons samtidigt | unknown | 0 av N körningar; exakt en reservation lyckas | Automatiserat samtidighetstest |
| Prioriterade felscenarier (se Edge Cases) som täcks av automatiska tester | 0 | 7 av 7, gröna | Testkörningens rapport via kommandot i README |
| Andel simulerade steg (SMS, butikskontroll, betalning, utbetalning) som är synligt märkta i gränssnittet | 0 | 100 % | Genomgång av demoflödet mot listan i FR10 |
| Reproducerbar körning | 0 | En ny klon startar och kör testerna med de kommandon som står i README | Körning på en ren maskin |


## Scope

### In Scope
- Konto och inloggning med mobilnummer och simulerad SMS-kod.
- Publicering av annons med simulerad kontroll av kod, saldo och giltighet.
- Ändring av pris och kod, rättning av flaggad annons och återkallelse.
- Sök, filter på handlare och sortering av aktiva annonser.
- Köp: atomär reservation, simulerad auktorisering, ny kontroll, dragning, leverans av kod.
- Affärens avslut via bekräftelse eller reklamationsperiod; simulerat säljarsaldo.
- Reklamation och tvist med beslut av demoadministratör.
- Automatisk utgång och varning om kort giltighetstid.
- "Mina kort" för säljare och köpare.
- Spårbar statushistorik och synlig märkning av allt simulerat.

### Out of Scope
- Riktig betalning, escrow, utbetalning till bankkonto och reglerad betalpartner.
- Riktiga SMS och riktig butiksintegration (verifieringsnivå 3).
- Presentkortsplånbok (lägga till kort som inte säljs, markera som använt, filter för använda kort).
- Gåvofunktion, "bjud in en vän", "om oss", vanliga frågor.
- Profilredigering utöver förnamn och efternamn vid kontoskapande.
- Avgifter till marknadsplatsen.
- Produktionsfrågor: juridisk granskning, konsumenträtt, GDPR, penningtvätt, skatt, bedrägeriskydd, identitetskontroll.

### MVP Boundary
En säljare publicerar ett kort som klarar den simulerade kontrollen, en köpare hittar det, köper det och ser koden och statusen "levererad", och minst ett felscenario (nekad betalning eller samtidigt köp) demonstreras – allt startat lokalt med det kommando som står i README.


## Functional Requirements

### User Stories

| ID | Story | Acceptance Criteria | Priority |
|----|-------|---------------------|----------|
| US01 | Som användare vill jag skapa konto och logga in med mitt mobilnummer, så att jag kan sälja och köpa utan lösenord. | Inloggning lyckas med koden som visas i det simulerade SMS:et; fel kod nekas. | Must / P0 |
| US02 | Som säljare vill jag lägga ut mitt presentkort med ett rabatterat pris, så att jag får värde för ett kort jag annars inte använder. | Ett kort som klarar kontrollen blir en aktiv annons som syns i sökningen utan kod. | Must / P0 |
| US03 | Som säljare vill jag kunna ändra priset, så att jag kan sälja snabbare om ingen köper. | Prisändring sparas när annonsen är aktiv och nekas när den är reserverad eller såld. | Must / P0 |
| US04 | Som köpare vill jag hitta och jämföra erbjudanden för en viss butik, så att jag får rabatt när jag ska handla. | Filter på handlare visar bara den handlarens aktiva annonser, sorterbara på rabatt, pris och giltighet. | Must / P0 |
| US05 | Som köpare vill jag förstå kortets giltighet och risk innan jag köper, så att jag inte köper något jag inte kan använda. | Annonsen visar saldo, pris, rabatt, giltighetsdatum, kontrollstatus och varning när mindre än 7 dagar återstår. | Must / P0 |
| US06 | Som köpare vill jag köpa snabbt och få koden direkt, så att jag kan använda den i kassan. | Efter godkänd simulerad betalning och kontroll visas koden och statusen "levererad". | Must / P0 |
| US07 | Som köpare vill jag inte debiteras för ett kort jag inte får, så att jag kan lita på tjänsten. | Nekad auktorisering, misslyckad kontroll eller utgången giltighet ger ingen dragning och ingen kod. | Must / P0 |
| US08 | Som säljare vill jag få betalt när affären är klar, så att jag får värde för kortet. | Säljarens simulerade saldo krediteras när affären avslutas. | Must / P0 |
| US09 | Som köpare vill jag kunna reklamera en kod som inte fungerar, så att jag inte står utan skydd. | En rapport inom reklamationsperioden skapar en tvist och fryser utbetalningen. | Must / P0 |
| US10 | Som demoadministratör vill jag avgöra en tvist, så att affären får ett tydligt utfall. | Beslut "återbetala" eller "avslå" ändrar affärens status och loggas. | Must / P0 |

### Feature Specifications

#### FR1: Inloggning med simulerad SMS-kod
**Description**: Användaren skapar konto med mobilnummer, förnamn och efternamn och loggar in med en engångskod. SMS:et simuleras: koden visas i gränssnittet i en ruta märkt "Simulerat SMS". Samma konto kan både sälja och köpa.

**Acceptance Criteria**:
- [ ] När en användare begär inloggningskod för ett registrerat mobilnummer ska systemet skapa en sexsiffrig engångskod och visa den i en ruta märkt "Simulerat SMS".
- [ ] När användaren anger rätt kod inom 10 minuter ska systemet logga in användaren.
- [ ] När en ny användare anger mobilnummer, förnamn och efternamn ska systemet skapa kontot och skicka en simulerad inloggningskod.
- [ ] Om koden är fel eller äldre än 10 minuter ska systemet neka inloggningen med ett felmeddelande och erbjuda att begära en ny kod.
- [ ] Om mobilnumret inte är ett giltigt svenskt mobilnummer ska systemet neka begäran med ett felmeddelande.
- [ ] Om ett konto redan finns för mobilnumret vid kontoskapande ska systemet hänvisa till inloggning.
- [ ] Om en användare begär inloggningskod för ett mobilnummer som inte är registrerat ska systemet hänvisa till kontoskapande med mobilnumret ifyllt.

**Inputs / Outputs**:
- **Inputs**: mobilnummer, förnamn, efternamn, engångskod.
- **Outputs**: inloggad session, simulerat SMS i gränssnittet.

**Priority**: Must / P0

#### FR2: Publicera annons
**Description**: Säljaren anger handlare (från en fast lista), kortets kod, uppgivet saldo, giltighetsdatum och pris. Den simulerade butikskontrollen körs innan annonsen blir aktiv.

**Acceptance Criteria**:
- [ ] När säljaren skickar in en annons med giltiga uppgifter och den simulerade kontrollen svarar "giltig" med samma saldo ska systemet skapa annonsen med status Aktiv och visa den i sökningen.
- [ ] När annonsen visas för andra än säljaren ska systemet aldrig visa kortets kod.
- [ ] Om priset inte är större än 0 och mindre än saldot ska systemet neka publiceringen med ett felmeddelande som anger gränserna.
- [ ] Om giltighetsdatumet har passerat ska systemet neka publiceringen.
- [ ] Om den simulerade kontrollen svarar "ogiltig" ska systemet neka publiceringen och förklara att koden inte godkändes.
- [ ] Om den simulerade kontrollen svarar med ett annat saldo än det uppgivna ska systemet neka publiceringen och visa det kontrollerade saldot, så att säljaren kan rätta.
- [ ] Om den simulerade kontrollen inte svarar inom 5 sekunder eller svarar med fel ska systemet neka publiceringen med ett meddelande om att kontrollen inte kunde genomföras och att säljaren kan försöka igen.
- [ ] Om samma kod för samma handlare har förekommit i någon tidigare annons, oavsett dess status, ska systemet neka publiceringen.

**Inputs / Outputs**:
- **Inputs**: handlare, kod, saldo (kr), giltighetsdatum, pris (kr).
- **Outputs**: annons med status Aktiv och märkningen "Kontrollerad (simulerat)", alternativt felmeddelande.

**Priority**: Must / P0

#### FR3: Hantera egen annons
**Description**: Säljaren kan ändra pris, kod och saldo, rätta en flaggad annons och återkalla annonsen – endast i tillåtna statusar och endast för sina egna annonser.

**Acceptance Criteria**:
- [ ] Medan annonsen är Aktiv, när säljaren ändrar priset, ska systemet spara det nya priset efter samma prisregel som vid publicering.
- [ ] Medan annonsen är Aktiv eller Flaggad, när säljaren ändrar kod eller saldo (för en Flaggad annons eventuellt tillsammans med nytt pris), ska systemet tillämpa samma prisregel och dubblettkontroll som vid publicering, köra den simulerade kontrollen igen och spara ändringen samt sätta status Aktiv endast om kontrollen godkänner.
- [ ] Om den nya kontrollen svarar "ogiltig", med ett annat saldo, inte svarar inom 5 sekunder eller svarar med fel ska systemet neka ändringen, behålla annonsens tidigare värden och status och visa orsaken.
- [ ] Om ett ändrat saldo gör att priset inte längre är mindre än saldot ska systemet neka ändringen.
- [ ] Medan annonsen är Aktiv eller Flaggad, när säljaren återkallar den, ska systemet sätta status Återkallad och ta bort den ur sökningen.
- [ ] Om säljaren försöker ändra enbart priset medan annonsen är Flaggad ska systemet neka ändringen och hänvisa till att rätta kod eller saldo.
- [ ] Om säljaren försöker ändra pris, kod eller saldo eller återkalla medan annonsen är Reserverad, Såld, Utgången eller Återkallad ska systemet neka ändringen och visa annonsens status.
- [ ] Om någon annan än annonsens säljare försöker ändra eller återkalla annonsen ska systemet neka åtgärden.

**Inputs / Outputs**:
- **Inputs**: nytt pris, ny kod eller nytt saldo, återkallelse.
- **Outputs**: uppdaterad annons och statushistorik, alternativt felmeddelande.

**Priority**: Must / P0

#### FR4: Sök och jämför erbjudanden
**Description**: Köparen ser en lista med aktiva annonser och kan filtrera på handlare och sortera.

**Acceptance Criteria**:
- [ ] När köparen öppnar sökningen ska systemet visa alla annonser med status Aktiv utom köparens egna, med handlare, saldo, pris, rabatt i kronor och procent, giltighetsdatum och kontrollstatus.
- [ ] När köparen väljer en handlare i filtret ska systemet visa endast den handlarens aktiva annonser.
- [ ] När köparen väljer sortering ska systemet sortera efter högst rabatt i procent (standard), lägst pris eller längst kvarvarande giltighet.
- [ ] När en annons har mindre än 7 dagar kvar till giltighetsdatumet ska systemet visa en varning om kort giltighet.
- [ ] Om inga aktiva annonser matchar ska systemet visa ett tomt läge som säger att inga erbjudanden finns för urvalet.
- [ ] Om en användare som inte är inloggad öppnar sökningen ska systemet hänvisa till inloggning.

**Inputs / Outputs**:
- **Inputs**: handlarfilter, sortering.
- **Outputs**: lista med annonser, aldrig kod.

**Priority**: Must / P0

#### FR5: Köp med reservation, auktorisering och leverans
**Description**: Köpet följer ordningen reservera → auktorisera → kontrollera → dra → leverera. Betalningen simuleras med deterministiska utfall; köparen kan i det simulerade betalsteget välja att godkänna eller neka betalningen, så att felscenariot kan visas.

**Acceptance Criteria**:
- [ ] Medan annonsen är Aktiv, när en köpare startar ett köp, ska systemet atomärt sätta annonsen till Reserverad för den köparen i 5 minuter och skapa ett köp med status Påbörjat, vars belopp låses till annonsens pris vid reservationen.
- [ ] När två köpare startar köp av samma annons samtidigt ska systemet låta exakt en reservation lyckas och visa för den andra köparen att annonsen redan är reserverad.
- [ ] När den simulerade betalningen auktoriseras ska systemet sätta köpet till Betalning auktoriserad och köra den simulerade butikskontrollen igen.
- [ ] När kontrollen svarar "giltig" med minst annonsens saldo och giltigheten inte har passerat ska systemet dra den auktoriserade betalningen, sätta köpet till Levererat, sätta annonsen till Såld och visa koden för köparen.
- [ ] Om den simulerade auktoriseringen nekas ska systemet sätta köpet till Misslyckat, inte leverera koden och sätta annonsen till Aktiv igen.
- [ ] Om kontrollen vid köp svarar "ogiltig" ska systemet släppa auktoriseringen, sätta köpet till Misslyckat, inte leverera koden och sätta annonsen till Flaggad.
- [ ] Om kontrollen vid köp svarar med ett lägre saldo än annonsens ska systemet släppa auktoriseringen, sätta köpet till Misslyckat, inte leverera koden, sätta annonsen till Flaggad med orsaken "saldoavvikelse" och förklara utfallet för köparen.
- [ ] Om kontrollen vid köp inte svarar inom 5 sekunder eller svarar med fel ska systemet släppa auktoriseringen, sätta köpet till Misslyckat, inte leverera koden och sätta annonsen till Aktiv igen.
- [ ] Om reservationen löper ut innan köpet har levererats ska systemet släppa en eventuell auktorisering, sätta köpet till Misslyckat och sätta annonsen till Aktiv igen.
- [ ] Om samma betalningsbesked tas emot mer än en gång ska systemet behandla det som ett enda besked, utan dubbel dragning eller dubbel leverans.
- [ ] Om köparen är annonsens säljare ska systemet neka köpet.

**Inputs / Outputs**:
- **Inputs**: köparens val av annons, simulerat betalningsutfall (godkänn/neka).
- **Outputs**: köp med status, kod synlig endast för köparen efter leverans, kvitto med belopp och tidpunkt.

**Priority**: Must / P0

#### FR6: Affärens avslut och säljarens utbetalning
**Description**: En levererad affär avslutas när köparen bekräftar att kortet fungerade, eller automatiskt när reklamationsperioden (24 timmar, konfigurerbar) har löpt ut utan reklamation. Säljarens simulerade saldo krediteras vid avslut.

**Acceptance Criteria**:
- [ ] Medan köpet är Levererat, när köparen bekräftar att kortet fungerade, ska systemet sätta köpet till Avslutat och kreditera säljarens simulerade saldo med köpesumman.
- [ ] Medan köpet är Levererat, när reklamationsperioden löper ut utan reklamation, ska systemet sätta köpet till Avslutat och kreditera säljarens simulerade saldo med köpesumman.
- [ ] När säljaren öppnar "mina kort" ska systemet visa det simulerade saldot märkt "Simulerad utbetalning".
- [ ] Om ett avslut utlöses mer än en gång för samma köp ska systemet kreditera säljaren endast en gång.
- [ ] Om någon annan än köpets köpare försöker bekräfta köpet ska systemet neka åtgärden.

**Inputs / Outputs**:
- **Inputs**: köparens bekräftelse, tidens gång.
- **Outputs**: status Avslutat, krediterat simulerat saldo.

**Priority**: Must / P0

#### FR7: Reklamation och tvist
**Description**: Köparen kan inom reklamationsperioden rapportera att koden inte fungerar. Affären blir en tvist, utbetalningen fryses och en demoadministratör beslutar. Ingen automatisk återbetalning sker.

**Acceptance Criteria**:
- [ ] Medan köpet är Levererat, när köparen rapporterar att koden inte fungerar med en motivering, ska systemet sätta köpet till Tvist och inte kreditera säljaren.
- [ ] När demoadministratören öppnar en tvist ska systemet visa köparens motivering och köpets statushistorik, men inte kortets kod.
- [ ] När demoadministratören beslutar "återbetala" ska systemet återbetala köparen (simulerat), sätta köpet till Återbetalat, låta annonsen förbli Såld, dölja koden för köparen och inte kreditera säljaren.
- [ ] När demoadministratören beslutar "avslå" ska systemet sätta köpet till Avslutat och kreditera säljarens simulerade saldo med köpesumman.
- [ ] Om köparen försöker reklamera när köpet är Avslutat, Tvist eller Återbetalat ska systemet neka reklamationen.
- [ ] Om en reklamation och reklamationsperiodens utgång inträffar samtidigt ska systemet låta den statusändring som registreras först gälla och neka den andra.
- [ ] Om någon annan än köpets köpare försöker reklamera ska systemet neka åtgärden.
- [ ] Om någon annan än demoadministratören försöker besluta i en tvist ska systemet neka åtgärden.

**Inputs / Outputs**:
- **Inputs**: köparens rapport med motivering, administratörens beslut.
- **Outputs**: status Tvist, Återbetalat eller Avslutat, loggat beslut.

**Priority**: Must / P0

#### FR8: Utgång av annonser
**Description**: Annonser följer kortets giltighetsdatum.

**Acceptance Criteria**:
- [ ] När giltighetsdatumet har passerat (efter dagens slut, svensk tid) för en Aktiv eller Flaggad annons ska systemet sätta annonsen till Utgången och ta bort den ur sökningen.
- [ ] När säljaren tittar på en utgången annons i "mina kort" ska systemet visa att den har gått ut och varför.
- [ ] Om giltighetsdatumet passerar medan annonsen är Reserverad och köpet inte har levererats ska systemet släppa en eventuell auktorisering, sätta köpet till Misslyckat med orsaken "kortet har gått ut" och sätta annonsen till Utgången.

**Inputs / Outputs**:
- **Inputs**: aktuellt datum, annonsens giltighetsdatum.
- **Outputs**: status Utgången, förklarande text.

**Priority**: Must / P0

#### FR9: Mina kort
**Description**: En vy för den inloggade användarens egna annonser och köp.

**Acceptance Criteria**:
- [ ] När säljaren öppnar "mina kort" ska systemet visa säljarens annonser med status, pris, saldo och orsak vid Flaggad eller Utgången, samt det simulerade saldot.
- [ ] När köparen öppnar "mina kort" ska systemet visa köparens köp med status, och koden för köp som är Levererade, Avslutade eller i Tvist.
- [ ] När användaren öppnar en annons eller ett köp ska systemet visa statushistoriken med tidpunkt för varje statusändring.
- [ ] Om användaren inte har några annonser eller köp ska systemet visa ett tomt läge med en länk till att publicera eller söka.

**Inputs / Outputs**:
- **Inputs**: inloggad användare.
- **Outputs**: listor med annonser och köp, statushistorik.

**Priority**: Must / P0

#### FR10: Märkning av simulering och demoläge
**Description**: Allt simulerat ska vara synligt som simulerat. Ett demoläge, som är på som standard när appen startas med README:s kommando, gör tidsberoende scenarier visbara inom en demo genom den simulerade klockan.

**Acceptance Criteria**:
- [ ] När gränssnittet visar SMS-kod, butikskontroll, betalsteg, återbetalning eller säljarens saldo ska systemet märka elementet synligt som simulerat (märkningarna "Simulerat SMS", "Kontrollerad (simulerat)" och "Simulerad utbetalning" i FR1, FR2 och FR6 uppfyller kravet).
- [ ] Systemet ska använda konfigurerbara tider för reservation och reklamationsperiod, med standardvärdena 5 minuter och 24 timmar även i demoläge.
- [ ] Medan demoläget är på, när demonstratören flyttar fram den simulerade klockan, ska systemet tillämpa alla tidsberoende regler (reservation, reklamationsperiod, utgång enligt FR8) mot den simulerade tiden och visa den simulerade tiden märkt "Simulerad tid".
- [ ] När den simulerade butikskontrollen anropas ska systemet ge ett deterministiskt svar som bestäms av kortets kod enligt en dokumenterad tabell (giltig, ogiltig, lägre saldo, inget svar, fel).
- [ ] När appen startas med README:s startkommando ska systemet vara i demoläge, med nollställd databas och förinlagda handlare, en demoadministratör, testanvändare och några aktiva annonser enligt README.
- Inga ytterligare oönskade villkor utöver de som ägs av FR1–FR9.

**Inputs / Outputs**:
- **Inputs**: konfiguration för demoläge, kortkod.
- **Outputs**: märkta gränssnittselement, deterministiska simulatorsvar.

**Priority**: Must / P0

### User Flows
1. **Huvudflöde (demo)**: säljaren loggar in → publicerar ett NK-kort med saldo 1 000 kr för 850 kr → kontrollen godkänner → köparen loggar in → filtrerar på NK → öppnar annonsen (15 % rabatt) → köper → godkänner den simulerade betalningen → ser koden och statusen Levererat → bekräftar att kortet fungerade → säljaren ser Såld och sitt simulerade saldo.
2. **Konkurrensflöde**: två köpare trycker "köp" på samma annons samtidigt → en får reservationen → den andra ser "annonsen är redan reserverad".
3. **Felflöde, nekad betalning**: köparen nekar i det simulerade betalsteget → köpet blir Misslyckat, ingen kod visas → annonsen är Aktiv igen och syns i sökningen.
4. **Felflöde, saldoavvikelse**: kontrollen vid köp svarar lägre saldo → köpet avbryts, ingen dragning → annonsen blir Flaggad → säljaren rättar saldot → annonsen blir Aktiv.
5. **Reklamationsflöde**: köparen rapporterar ogiltig kod → Tvist → demoadministratören återbetalar eller avslår.

### UI Wireframes
- Inga wireframes. Skärmarna utformas under bygget med Figma-underlaget (`docs/requirements/Presentkortsapp.pdf`) som stilreferens: färger, typsnitt, kort- och listkomponenter, flikmeny.

### Data Requirements
- **Användare**: mobilnummer (unikt), förnamn, efternamn, roll (användare eller demoadministratör), simulerat saldo.
- **Handlare**: namn, förkortning; fast förinlagd lista.
- **Annons**: säljare, handlare, kod (hemlig), saldo, giltighetsdatum, pris, status (Aktiv, Reserverad, Såld, Flaggad, Utgången, Återkallad), flaggningsorsak, reserverad av och till när.
- **Köp**: annons, köpare, belopp, status (Påbörjat, Betalning auktoriserad, Levererat, Avslutat, Misslyckat, Tvist, Återbetalat), orsak vid misslyckande, reklamationens motivering, administratörens beslut.
- **Statushistorik**: för varje statusändring på annons och köp – tidpunkt, föregående och ny status, aktör och orsak.
- Data behöver inte bevaras mellan omstarter utöver det som krävs för demon; förinlagd testdata återskapas vid start.


## Non-Functional Requirements

| Category | Requirement | Threshold / Target |
|----------|-------------|--------------------|
| Performance | Köpflödet från "köp" till synlig kod när simulatorerna svarar direkt | ≤ 2 s lokalt |
| Reliability | Reservation och statusövergångar är atomära och idempotenta | 0 dubbelförsäljningar och 0 dubbla dragningar/krediteringar i automatiska tester |
| Security | Kortets kod exponeras aldrig i sök, annonsvy, API-svar eller loggar till andra än säljaren och köparen efter leverans | 0 förekomster i automatiska tester av publika svar |
| Security | Endast annonsens säljare får ändra den; endast köpets köpare får godkänna eller neka betalningen, bekräfta eller reklamera; endast demoadministratören får besluta i tvister | Alla otillåtna försök nekas i automatiska tester |
| Usability | Mobilanpassad webbapp | Alla vyer fungerar utan horisontell scroll vid 360 px bredd |
| Usability | Simulerade steg är tydligt märkta | 100 % av elementen i FR10 |
| Reproducibility | Start och testkörning | Dokumenterade kommandon i README; en ny klon startar och testar utan manuella steg utöver installation av verktygen |
| Traceability | Statusändringar spåras | Varje övergång finns i statushistoriken med tidpunkt, aktör och orsak |


## Edge Cases

De sju prioriterade felscenarierna i handledarbilaga F (`docs/requirements/Kundcase_Presentkortsmarknaden.pdf`) gäller alla och ägs av FR3, FR5, FR7 och FR8:

1. Två köpare reserverar samma annons samtidigt – bara en lyckas (FR5).
2. Betalningsauktorisering nekas – ingen kod levereras, annonsen blir Aktiv igen (FR5).
3. Kortets giltighetstid passerar under köpet (FR8).
4. Kontrollen anger lägre saldo än annonsen (FR5).
5. Samma betalningsbesked tas emot två gånger – ingen dubbel leverans eller dragning (FR5).
6. Säljaren försöker ändra pris eller kod när annonsen är Reserverad (FR3).
7. Köparen rapporterar ogiltig kod efter leverans – tvist utan automatisk återbetalning (FR7).

Här listas de fall som ingen enskild funktion äger.

| Scenario | Expected Behavior | Recovery Path |
|----------|-------------------|---------------|
| Säljaren använder koden i butiken medan annonsen är reserverad eller efter leverans | Tjänsten kan inte förhindra det; kontrollen vid köp fångar det före leverans, annars via reklamation | Köpet avbryts (FR5) eller tvist (FR7) |
| Simulatorn svarar sent efter att köpet redan har misslyckats på grund av tidsgräns | Det sena svaret ignoreras; ingen dragning eller leverans | Köparen kan starta ett nytt köp om annonsen är Aktiv |
| Reservationen löper ut exakt när betalningsbeskedet kommer | Utfallet är entydigt: antingen levereras köpet och annonsen blir Såld, eller så misslyckas köpet och auktoriseringen släpps – aldrig båda | Köparen ser slutlig status i "mina kort" |
| Användaren loggar ut eller stänger appen mitt i ett köp | Reservationen löper ut enligt FR5 | Annonsen blir Aktiv igen |
| Samma användare öppnar köpet i två flikar | Endast en reservation per annons; den andra fliken ser aktuell status | Uppdatera vyn |


## Constraints & Assumptions

### Constraints
- **Stadium**: prototyp för kursdemo. **Skala**: ett fåtal demoanvändare, lokal körning, 1–3 personer som underhåller. **Standing technical non-goals**: riktig betalning, riktig utbetalning, riktiga SMS, butiksintegration och produktionsdrift.
- Betalning, SMS och butikskontroll simuleras och märks synligt (briefen: "Det måste tydligt framgå vad som är simulerat").
- Teknikval görs av teamet och dokumenteras; kör- och testkommandon ska stå i README; automatiserbara tester eftersträvas.
- Arbetet följer kursens AndThen-process med gates C1–C5.
- Figma är en stilreferens, inte en bindande specifikation.

### Assumptions
- **Affär**: köparen accepterar att en tidigare kontroll inte garanterar saldot vid inlösen; skyddet är reklamationen.
- **Affär**: inga avgifter tas ut av marknadsplatsen i MVP:n.
- **Användare**: säljare och köpare är privatpersoner i Sverige med svenskt mobilnummer; belopp i hela kronor.
- **Användare**: alla presentkort i MVP:n antas vara överlåtbara; personliga eller kanalbegränsade kort hanteras inte.
- **Teknik**: en demoadministratör räcker för att avgöra tvister.
- **Teknik**: tidsberoende regler (reservation, reklamationsperiod, utgång) använder svensk tid.

### Dependencies

| Dependency | Why It Matters |
|------------|----------------|
| Simulerad butikskontroll (testadapter) med dokumenterad svarstabell | Styr publicering, köp och alla verifieringsrelaterade felscenarier |
| Simulerad betalleverantör (auktorisera, dra, släpp, återbetala) | Styr betal- och felflöden; ska vara deterministisk och testbar |
| Teknikval som teamet dokumenterar | Krävs innan planering och implementation – gjort i ADR-001 till ADR-005 (`docs/DECISIONS.md`) |


## Open Questions

- Vilken teknikstack (frontend, backend, datalagring, testramverk) ska prototypen byggas med, och hur säkerställs atomär reservation i den? – Avgjord av ADR-001 till ADR-005 (`docs/DECISIONS.md`).
- Vilka statusövergångar är tillåtna utöver dem som FR2–FR8 anger? – Inga: endast de övergångar som FR2–FR8 uttryckligen anger är tillåtna; alla andra nekas med ett domänfel (beslutat vid planering 2026-11-17). Aggregatindelningen är en implementationsfråga för planen.
- Area to revisit: produktionslansering – juridisk granskning av presentkortsvillkor, konsumenträtt, GDPR, betal- och penningtvättsregler, skatt och bedrägeriskydd skulle avgöra vad som krävs bortom prototypen.
- Area to revisit: marknadshypotesen om andelen kort som aldrig används – data eller användarintervjuer skulle göra den till ett faktum.


## Decisions Log

| Decision | Rationale | Alternatives Considered |
|----------|-----------|-------------------------|
| Prototyp för kursdemo, lokal körning | Briefen kräver en demonstrerbar MVP, inte en färdig betaltjänst | Intern pilot; mot produktion |
| Inloggning med mobilnummer och simulerad SMS-kod; samma konto säljer och köper | Följer Figma-flödet och briefens tillåtna simulering av SMS | Växlare för demoanvändare; båda |
| Verifieringsnivå 2: simulerad butikskontroll vid publicering och vid köp | Ger trovärdig strategi och testbara felscenarier utan butiksintegration | Endast säljarens uppgift (nivå 1); kontroll endast vid köp |
| Köpordning: reservera → auktorisera → kontrollera → dra → leverera | Ingen kod lämnas ut och inga pengar dras om kontrollen misslyckas | Betala före kod; fördröjd utbetalning |
| Reservationstid 5 minuter, konfigurerbar | Passar köp i kassan utan att låsa annonsen länge | 15 minuter; ingen tidsgräns |
| Prisregel 0 < pris < saldo, ingen avgift | Garanterar att varje annons är en rabatt | 0 < pris ≤ saldo; pris + plattformsavgift |
| Mobilanpassad webbapp | Lätt att demonstrera och testa end-to-end; matchar Figmas mobilformat | Native mobilapp; desktopwebb |
| Omfattning "mina kort" utan plånbok, gåvor och inbjudningar | Briefen anger dessa som stödjande, inte huvuduppgiften | Plånbok + marknadsplats; endast marknadsplats |
| Lägre saldo vid köp: avbryt, släpp auktorisering, flagga annonsen | Köparen får aldrig mindre än annonserat; säljaren kan rätta | Låt köparen välja; justera priset proportionellt |
| Affären avslutas vid köparens bekräftelse eller efter 24 h reklamationsperiod | Ger ett naturligt fönster för reklamation innan säljaren krediteras | Avslut direkt vid leverans; endast vid köparens bekräftelse |
| Ogiltig kod efter leverans: tvist, frusen utbetalning, administratören beslutar | Tydlig gräns för automatisk återbetalning, enligt briefens risker | Automatisk återbetalning vid bekräftad kontroll; ingen reklamation |
| Utgång: automatisk efter giltighetsdagen, varning under 7 dagar, avbrutet köp om giltigheten passerar | Begriplig hantering av utgångna erbjudanden enligt briefen | Minsta kvarvarande giltighet vid publicering; endast visning |
| FR7 Reklamation och tvist är Must / P0 | Felscenario 7 (ogiltig kod efter leverans) ingår i målet 7 av 7 och ägs bara av FR7 | Behålla Should och sänka målet till 6 av 7 |
| En kod som förekommit i någon tidigare annons för samma handlare kan aldrig publiceras igen | Stänger dubbelförsäljning av samma kort över annonser | Spärra bara sålda koder; låta kontrollen avgöra |
| Misslyckad ny kontroll vid ändring nekar ändringen och behåller tidigare värden | Annonsen förblir köpbar och säljaren får direkt återkoppling | Flagga annonsen |
| Simulerad klocka i demoläge | Gör utgång och reklamationsperiod synliga i en tvåminutersdemo och testbara | Förinlagd utgången data; endast i tester |
| Endast de statusövergångar som FR2–FR8 anger är tillåtna; övriga nekas | Varje övergång blir explicit och testad (ADR-003) | Låta implementationen lägga till rimliga övergångar |
| Demoläget är på som standard och använder samma tider som normalt (5 min reservation, 24 h reklamationsperiod); tidsscenarier visas genom att flytta den simulerade klockan | En konfiguration att resonera om; klockan räcker för att visa tidsregler | Kortare tider i demoläge (2 min / 3 min); separat demokommando |
| Demostarten lägger in några aktiva annonser från en testanvändare hos andra handlare än NK | Sökning, filter och sortering visar något direkt i demon, medan demoflödets NK-annons förblir ensam hos NK | Inga förinlagda annonser |
| Antaganden bekräftade efter granskning: pris låses vid reservation; endast köparen bekräftar och reklamerar; pris kan inte ändras ensamt på Flaggad annons; första statusändring vinner vid samtidig reklamation och periodutgång; efter återbetalning förblir annonsen Såld och koden döljs; administratören ser inte koden; oregistrerat nummer hänvisas till kontoskapande; sökning kräver inloggning | Stänger luckor som granskningen hittade | – |
| Skärmarna utformas under bygget med Figma som stilreferens; ingen separat designfas före planering | Räcker för en kursdemo och sparar tid | Wireframes först; klickbara mockups först |
| Begrepp: **Annons** (ett presentkort till salu), **Köp** (en köpares affär om en annons), **Reservation** (tidsbegränsat lås av annonsen för en köpare), **Saldoavvikelse** (kontrollerat saldo lägre än annonserat), **Reklamationsperiod** (fönstret efter leverans då köparen kan rapportera fel), **Tvist** (en reklamerad affär som väntar på beslut) | Begreppen fastställdes under intervjun; projektet har ännu ingen ordlista | – |
