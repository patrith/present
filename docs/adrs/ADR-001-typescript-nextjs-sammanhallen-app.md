# ADR-001: TypeScript och Next.js som en sammanhållen webbapp

## Status
Accepted

## Context
Presentkortsmarknaden är en prototyp för kursdemo som körs lokalt (`docs/PRODUCT.md`, Proportionality). Kravdokumentet (`docs/specs/applikation-for-kop-och-salj-av/prd.md`) kräver en mobilanpassad webbapp, att kortets kod aldrig når andra än säljare och köpare, att körning och test står i README och att demoflödet kan visas på två minuter. Briefen låter teamet välja teknik men kräver att valet dokumenteras.

## Decision
Appen byggs i TypeScript genom hela stacken som **en** Next.js-app (App Router). Sidor, serveractions och de få API-routes som behövs körs i samma Node-process och startas med ett kommando. Domänlogik (annons, köp, statusövergångar) ligger i ren TypeScript utanför Next.js-specifika filer, så att den kan testas utan ramverket. Kortets kod läses och returneras bara i serverkod efter behörighetskontroll.

## Consequences
- Lättare: ett språk, delade typer för statusar och API, en process att starta, demonstrera och testa end-to-end.
- Lättare: serverkomponenter och serveractions håller hemlig data på servern som standard.
- Svårare: vi binder oss till Next.js konventioner (App Router, cache-beteende). Bakgrundssvepet (ADR-005) måste startas via `instrumentation.ts` och skyddas mot dubbelstart i dev-läge.
- Svårare: Next.js cachning måste stängas av för sidor med live-status (dynamisk rendering).

**Reversal**: one-way door – byte av språk eller ramverk innebär att skriva om UI och serverlager. Domänlogiken i ren TypeScript kan flyttas till ett annat TS-ramverk.

## Alternatives Considered
1. **.NET (C#) med Blazor** – rejected: robust, men teamet valde TypeScript och ett språk även för end-to-end-tester.
2. **Python eller Java/Kotlin backend + separat frontend** – rejected: två språk och tyngre verktygskedja för en kursdemo.
3. **Separat frontend och API** – rejected: två processer att starta och konfigurera, utan nytta i prototypstadiet.
4. **SvelteKit / React Router v7 / Express + Vite** – rejected: likvärdiga helhetsmodeller, men mindre ekosystem eller mer egen ihopkoppling än Next.js.
5. **Floor option – bara frontend, som HTML-prototypen** – rejected: kan inte bevisa att samtidiga köp stoppas av en delad lagring eller att koden hålls hemlig på en server.

## Implementation Notes
- Next.js med App Router och TypeScript i strikt läge. Node LTS-version fastställs i planeringen.
- Mappstruktur, komponentbibliotek och styling avgörs i planeringen. Figma-underlaget är stilreferens.
- Kommandon för att köra och testa dokumenteras i README och i `Key Dev Commands`.

## Project Compliance
Följer Proportionality i `docs/PRODUCT.md` (prototyp, lokal körning) och kravdokumentets beslut om mobilanpassad webbapp.

## References
- `docs/specs/applikation-for-kop-och-salj-av/prd.md`
- ADR-002, ADR-003, ADR-004, ADR-005
