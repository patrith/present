# Project Learnings

<!-- Traps only, one bullet each: `- **<title>** – <trap + fix>`. Admit a trap only if a frontier
     model doesn't know it, the code and git history don't carry it, and it outlives the current
     initiative; an initiative-only trap goes in that initiative's PRD, plan, or FIS. Before
     appending, check for a reworded duplicate. Delete an entry once a check encodes it. -->

## Dependencies & Runtime

- **better-sqlite3 13.x breaks `npm ci` on Windows** – 13.x still runs `node-gyp rebuild` under `npm ci` (npm 10) and fails without a Visual Studio that node-gyp recognises, although `npm install` succeeds. Keep `better-sqlite3` on 12.x (installs through `prebuild-install`) and prove any bump with `npm ci && npm run test:full`.
- **TypeScript 7 does not fit Next.js 16** – npm's latest `typescript` is the native 7.x port; Next.js 16's type tooling targets the 5.x API. Keep `typescript` pinned to `~5.9`.

## Framework Patterns

- **React 19 resets a form after its `action`** – a refused submit loses what the user typed. Build forms on `src/components/action-form.tsx` (`ActionForm` submits through `onSubmit` + `startTransition` and keeps `action` for no-JS posts), never on a bare `<form action>`.
- **better-sqlite3 is synchronous, so in-process races don't interleave** – a check and a write with no `await` between them can't race inside one Node process, so a race test passes without exercising the guard. A test that must prove a conditional-UPDATE guard needs an `await` between read and write (or a forced status), not two parallel calls.

## Domain Patterns

- **`expireDue`'s rule order is load-bearing** – in `expiryRules` (`src/domain/expire-due.ts`), `expireReservedPastValidity` must run before `expireReservations` (the earlier deadline decides the köp's orsak) and `expirePastValidity` after it (an annons the reservation rule frees expires in the same call). Independent rules such as the claim-period rule go last.
- **Adapter calls after a DB commit have no recovery** – capture, void and refund run after the transition commits, and the simulated adapters keep state in memory. A `next dev` self-restart without the demo reset desynchronises them from `data/demo.db`, and a throwing after-commit call leaves the row in its new status with no retry. Restart through `npm run dev` (which resets the DB) after touching adapter state.
- **Import cycle between `expire-due.ts` and `purchases.ts`** – `purchases.ts` imports `expireDue`, so a transaction helper `expire-due.ts` needs (`completePurchaseTx`, `failPurchaseTx`) lives in its own module (`completion.ts`, `purchase-failure.ts`), never in `purchases.ts`.
- **"Simulerad butikskontroll" is matched on orsak text** – `failedAtCheck` compares a köp's stored `failureReason` with the `CHECK_*` constants in `src/domain/purchases.ts`; changing those strings silently drops the label from existing köp.

## Error Patterns

| Error | Type | Conclusion |
|-------|------|------------|
| Drizzle migration conflict in `drizzle/meta/_journal.json` on merge | Deterministic | Two branches each generated the next-numbered migration; regenerate one of them after merging, never hand-merge the journal. |

## Process & Tooling

- **`git grep` proofs pass vacuously on untracked files** – a `cmd:` proof that greps for a forbidden pattern sees tracked files only. Mark new files intent-to-add (`git add -N`) before running it.
- **The e2e tier can't run twice at once** – `playwright.config.ts` fixes port 3100 with `reuseExistingServer: false`. Parallel worktrees need a worktree-local config on another port, with `DATABASE_PATH` set for both the server and the spec process (the DB fixtures open `process.env.DATABASE_PATH`).
- **The e2e database is shared across spec files** – specs leave annonser, köp and utbetalningssaldo behind, so assert deltas read just before the step (or set the Given through a DB fixture), never absolute counts or saldon.
