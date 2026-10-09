# MAC Recap

Next.js 16 app (App Router, standalone output) plus a worker, built as a modular
monolith. Planning documents live in `_bmad-output/`; the architecture spine is in
`_bmad-output/planning-artifacts/architecture/`.

## Requirements

- Node.js 24 (`nvm use` reads `.nvmrc`); npm installs with exact versions (`.npmrc`).
- Docker, for the local Supabase stack. The Supabase CLI is a pinned dev
  dependency, so no global install is needed.

## Local setup

```sh
npm ci
npm run db:start      # starts the local Supabase stack in Docker (supabase start)
npx supabase status   # prints the local API URL and keys
cp .env.example .env.local
# fill in .env.local from `supabase status`
npm run db:types      # writes src/shared/db.types.ts from the local database
npm run dev
```

### Environment variables

Validated by `src/shared/env.ts`, the only file that reads `process.env`. The
server and the worker refuse to start if any is missing or invalid. None carries
the `NEXT_PUBLIC_` prefix: the browser never talks to Supabase directly.

| Variable | Local value (from `npx supabase status`) |
| --- | --- |
| `SUPABASE_URL` | API URL, `http://127.0.0.1:54321` |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key |
| `SUPABASE_SECRET_KEY` | Secret key (server only) |

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build (`.next/standalone`) |
| `npm run lint` | ESLint, including the module-boundary rules |
| `npm run typecheck` | Generates Next route types, then `tsc --noEmit` |
| `npm test` | Vitest unit tests and lint-boundary fixtures |
| `npm run db:start` | `supabase start` (needs Docker) |
| `npm run db:types` | `supabase gen types` from the local DB into `src/shared/db.types.ts` |

CI (`.github/workflows/ci.yml`) runs `npm ci`, lint, typecheck and tests on Node 24.

## Layout and boundaries

```text
src/
  app/        pages, server actions, route handlers
  worker/     job loop entry (bundled in Story 2.2)
  shared/     env.ts, result.ts, log.ts, utils.ts, db.types.ts (committed, see below)
  modules/
    case-study/ material/ generation/ rendering/ sharing/ access/ jobs/
      domain/ application/ index.ts   (+ ports/ adapters/ only at vendor seams)
supabase/     config.toml, migrations/ (forward-only SQL)
```

`eslint.config.mjs` enforces the boundaries:

- `src/app` and `src/worker` import a module only through `@/modules/<module>` (its `index.ts`).
- A module imports another module only through its index. Inside `src/modules`, cross-folder
  imports use the `@/modules/...` alias; only `./` relative imports are allowed.
- Vendor SDKs (Supabase, AWS, Anthropic, Playwright, sharp) are imported only in `adapters/`;
  generated DB types too.
- `domain/` imports only `@/shared/*`, files of its own `domain/` and `zod`.
- `src/modules/integration` is reserved for Epic 7; no MCP client in the MVP.
- `process.env` is read only in `src/shared/env.ts`.

## Database types

`src/shared/db.types.ts` is committed so CI can typecheck without Docker. It must
match the migrations in `supabase/migrations/`: after adding or changing a
migration, whoever has Docker runs `npm run db:start` and `npm run db:types`
and commits the regenerated file with the migration. (The first version was
written by hand in `supabase gen types` shape for the `profile` migration.)
Only `adapters/` may import it.

## Authorization

Every server action and route handler calls `getActor()` and then
`authorize(actor, action, resource)` from `@/modules/access` before any other
module call (AD-11); `test/authorize-guard.test.ts` enforces this for
`"use server"` modules, inline server actions and `route.ts` handlers. The
role matrix lives only in `src/modules/access/domain/policy.ts`. Until Epic 6,
`getActor()` resolves the seeded dev owner/designer profile; the seeded
`system` profile is the worker's actor.

Exact versions only: `test/scaffold.test.ts` fails if any dependency in `package.json`
uses `^`, `~` or a tag.
