# Ubiquitous Language

> Domain glossary for Presentkortsmarknaden. Use these exact terms in code, documentation, and discussion; avoid the listed synonyms.
>
> **Glossary and nothing else.** A term earns a row when getting its name wrong causes a defect – ambiguity, schema drift, misrouting. A row is one sentence under 200 characters: what the term is and where it lives. Mechanism, rationale, status, and open questions stay in the document that owns them – point, don't restate.

<!-- Terms are Swedish (the product's language); the identifier in parentheses is the English name to use in code. -->

## Aktörer

| Term | Definition | Avoid (synonyms) | Bounded Context |
|------|-----------|-------------------|-----------------|
| Användare | En person med konto (mobilnummer, namn) som kan vara både säljare och köpare (`user`). | kund, medlem | |
| Säljare | Användaren som äger en annons (`seller`). | annonsör, ägare | |
| Köpare | Användaren som gör ett köp av en annons (`buyer`). | kund | |
| Demoadministratör | Förinlagd roll som avgör tvister; finns bara i prototypen (`admin`). | admin, administratör, moderator | |

## Presentkort och annons

| Term | Definition | Avoid (synonyms) | Bounded Context |
|------|-----------|-------------------|-----------------|
| Presentkort | Ett värdebevis hos en handlare, med presentkortskod, saldo och giltighetsdatum (`giftCard`). | kort (ensamt), värdebevis | |
| Handlare | Företaget som presentkortet gäller hos; en fast förinlagd lista (`merchant`). | butik, utgivare, företag | |
| Presentkortskod | Den hemliga koden som löser in presentkortet; visas bara för säljaren och, efter leverans, köparen (`giftCardCode`). | kod (ensamt), värdekod | |
| Saldo | Presentkortets värde i kronor, uppgivet av säljaren och kontrollerat av butikskontrollen (`balance`). | värde, nominellt värde, belopp | |
| Giltighetsdatum | Sista dag presentkortet gäller; annonsen går ut efter dagens slut, svensk tid (`validUntil`). | giltighetstid, utgångsdatum, bäst före | |
| Annons | Ett presentkort som en säljare erbjuder till salu för ett pris (`listing`). | erbjudande (i kod och data), objekt | |
| Pris | Det belopp köparen betalar för annonsen; alltid större än 0 och lägre än saldot (`price`). | säljpris, kostnad | |
| Rabatt | Saldo minus pris, visad i kronor och procent (`discount`). | besparing | |
| Erbjudande | En aktiv annons sådan den visas för köpare i sökningen; endast UI-text, aldrig ett eget begrepp i kod. | | |
| Flaggad | Annonsstatus när butikskontrollen inte godkänner kortet; annonsen syns inte i sökningen tills säljaren rättar den (`flagged`). | spärrad, blockerad | |
| Saldoavvikelse | Flaggningsorsak när butikskontrollen anger lägre saldo än annonsen (`balanceMismatch`). | saldofel, differens | |
| Återkallad | Annonsstatus när säljaren själv har tagit bort annonsen (`withdrawn`). | avpublicerad, raderad, avbruten | |
| Utgången | Annonsstatus när giltighetsdatumet har passerat (`expired`). | förfallen, inaktiv | |
| Dubblettkontroll | Regeln att en presentkortskod som förekommit i någon tidigare annons för samma handlare inte får publiceras igen (`duplicateCheck`). | | |

## Köp och betalning

| Term | Definition | Avoid (synonyms) | Bounded Context |
|------|-----------|-------------------|-----------------|
| Köp | En köpares transaktion för en annons, från reservation till avslut (`purchase`). | affär, order, transaktion | |
| Reservation | Tidsbegränsat lås (5 min) av en annons för en köpare medan köpet pågår (`reservation`). | bokning, hold, spärr | |
| Auktorisering | Simulerad reservation av köparens pengar utan att de dras (`authorize`). | förhandsgodkännande | |
| Dragning | Att den auktoriserade betalningen faktiskt tas (`capture`). | debitering, betalning (ensamt) | |
| Släpp | Att en auktorisering hävs utan dragning (`void`). | annullering | |
| Betalningsbesked | Svaret från den simulerade betalleverantören om ett betalsteg; kan komma mer än en gång (`paymentCallback`). | callback (i UI-text), notifiering | |
| Leverans | Att presentkortskoden lämnas ut till köparen efter dragning (`delivery`). | överlämning, utskick | |
| Butikskontroll | Simulerad kontroll av presentkortskod, saldo och giltighet hos handlaren, vid publicering och vid köp (`GiftCardVerifier`). | verifiering, validering, giltighetskontroll | |

## Efter köpet

| Term | Definition | Avoid (synonyms) | Bounded Context |
|------|-----------|-------------------|-----------------|
| Reklamationsperiod | Fönstret (24 h) efter leverans då köparen kan reklamera (`claimPeriod`). | garantitid, ångerrätt | |
| Reklamation | Köparens rapport att presentkortskoden inte fungerade (`claim`). | klagomål, ärende | |
| Tvist | Köpstatus när en reklamation väntar på demoadministratörens beslut (`disputed`). | ärende, konflikt | |
| Avslut | Att ett köp blir slutgiltigt genom köparens bekräftelse, utgången reklamationsperiod eller avslagen tvist (`complete`). | stängning, slutförande | |
| Återbetalning | Simulerad återföring av köparens pengar efter en beviljad tvist (`refund`). | återköp, kreditering | |
| Utbetalningssaldo | Säljarens simulerade tillgodohavande från avslutade köp (`payoutBalance`). | saldo (ensamt), simulerat saldo, tillgodohavande | |
| Statushistorik | Loggen av varje statusändring på en annons eller ett köp, med tid, aktör och orsak (`statusHistory`). | logg, audit trail | |

## Simulering och demo

| Term | Definition | Avoid (synonyms) | Bounded Context |
|------|-----------|-------------------|-----------------|
| Simulerad | Märkning av ett steg som inte är verkligt: SMS, butikskontroll, betalning, utbetalning, tid (`simulated`). | fejk, mock (i UI-text) | |
| Inloggningskod | Engångskod som skickas i ett simulerat SMS vid inloggning (`loginCode`). | kod (ensamt), OTP (i UI-text) | |
| Demoläge | Körläge med förinlagd data, kortade tider och simulerad klocka (`demoMode`). | testläge | |
| Simulerad klocka | Den flyttbara tid som alla tidsregler använder i demoläge och tester (`Clock`). | fejktid, testklocka | |

## Overloaded Terms

| Term | Context A | Meaning A | Context B | Meaning B |
|------|-----------|-----------|-----------|-----------|
| Saldo | Presentkort och annons | Presentkortets värde i kronor | Efter köpet | Säljarens utbetalningssaldo – skriv alltid "utbetalningssaldo" |
| Kod | Presentkort och annons | Presentkortskoden | Simulering och demo | Inloggningskoden – skriv alltid den fullständiga termen |
| Tvist | Efter köpet | Köpstatusen Tvist | Efter köpet | Processen från reklamation till beslut – status och process delar namn medvetet |
