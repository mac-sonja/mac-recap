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
server and the worker refuse to start if any required variable is missing or
invalid. None carries the `NEXT_PUBLIC_` prefix: the browser never talks to
Supabase directly.

| Variable | Local value / purpose |
| --- | --- |
| `SUPABASE_URL` | API URL from `npx supabase status`, `http://127.0.0.1:54321` |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key from `npx supabase status` |
| `SUPABASE_SECRET_KEY` | Secret key from `npx supabase status` (server only) |
| `BASIC_AUTH_USER` | Basic-auth gate user (web only; see below) |
| `BASIC_AUTH_PASSWORD` | Basic-auth gate password (web only; see below) |

#### Basic-auth gate

Until login ships (Epic 6), `src/proxy.ts` puts HTTP basic auth in front of every
request the web process serves, including `/s/*`, `/_next/*` and 404s; there is no
unauthenticated path. Credentials are compared in constant time.

- **Production** (any `NODE_ENV` other than `development` or `test`, including unset;
  the standalone `server.js` and `next start` set `production`): both
  `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` are required. If either is unset or
  empty, the web process exits with code 1 before serving, naming it (in the
  Docker image, before the port opens; see Deploy).
- **Development / test** (`npm run dev`, Vitest): both are optional. Leave both unset
  or empty for no gate, or set both to try it. Setting only one is treated as a
  misconfiguration (exit 1).
- **Worker**: never needs them.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build: `next build` (`.next/standalone`), then `build:dist` |
| `npm run build:dist` | esbuild bundles `dist/worker.js` and `dist/preflight.js` (Node 24, CJS, deps inlined) |
| `npm run lint` | ESLint, including the module-boundary rules |
| `npm run typecheck` | Generates Next route types, then `tsc --noEmit` |
| `npm test` | Vitest unit tests and lint-boundary fixtures |
| `npm run db:start` | `supabase start` (needs Docker) |
| `npm run db:types` | `supabase gen types` from the local DB into `src/shared/db.types.ts` |

CI (`.github/workflows/ci.yml`) has two jobs: `check` runs `npm ci`, lint, typecheck,
tests and the build on Node 24; `image` builds the Docker image and runs
`scripts/smoke-image.sh` against it (see Deploy).

## Layout and boundaries

```text
src/
  app/        pages, server actions, route handlers
  worker/     worker entry, bundled to dist/worker.js (idles until the job loop lands)
  preflight.ts  env + gate check loaded before server.js, bundled to dist/preflight.js
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

## Deploy

One Docker image runs both processes. It is built on
`mcr.microsoft.com/playwright:v1.63.0-noble` (Node 24, npm, the Playwright
browsers, user `pwuser`) with ffmpeg pinned to Ubuntu noble's `7:6.1.1-3ubuntu5`.
The image carries no host-specific configuration; every setting comes from the
environment at run time.

### Build

```sh
docker build --platform linux/amd64 --tag mac-recap:<version> .
scripts/smoke-image.sh mac-recap:<version>   # optional locally; CI runs it on every PR
```

Build the image you deploy with `--platform linux/amd64`, so one built on an Apple
Silicon machine still runs on an amd64 host.

The runtime runs as `pwuser` with `NODE_ENV=production`, `HOSTNAME=0.0.0.0` and
`PORT=3000`, and contains only the standalone server, `.next/static` and `dist/`.
`HOSTNAME` is the address the web process binds to: a host that injects its own
`HOSTNAME` (Kubernetes sets it to the pod name) must set it back to `0.0.0.0`, or
the server listens only on that name and probes and traffic miss it.

### Run

Start both processes from the same image with the same environment (the
variables in [Environment variables](#environment-variables); the worker ignores
the basic-auth pair):

| Process | Command | Notes |
| --- | --- | --- |
| Web | default `CMD`: `node --require ./dist/preflight.js server.js` | Listens on 3000. The preflight checks the environment and the basic-auth gate first, so a missing or invalid variable exits 1 before the port opens. |
| Worker | `node dist/worker.js` | Logs one JSON readiness line, then idles (no job loop yet). Exits 0 on SIGTERM or SIGINT, 1 on an invalid environment. |

```sh
docker run --env-file staging.env -p 3000:3000 mac-recap:<version>
docker run --env-file staging.env mac-recap:<version> node dist/worker.js
```

### Probes

The gate has no unauthenticated path, and the image defines no `HEALTHCHECK`
because the worker shares it. Configure the host instead:

- **Web:** a TCP check on port 3000, or an HTTP check that sends
  `Authorization: Basic <base64 of user:password>` (without it every path answers 401).
- **Worker:** process liveness only; it opens no port.

### Caching

No shared cache or CDN may sit in front of the web process. Next serves
`/_next/static/*` as `public, immutable`, so a shared cache could replay those
responses to clients that never passed the gate.

### Migrations

Migrations are forward-only SQL files in `supabase/migrations/`; never edit or
revert one that has been applied. To recover from a bad migration, write a new
corrective migration and push it the same way. Each environment has its own
Supabase project. Apply migrations before starting the image that needs them:

- **Compatible with the running image.** A migration is applied while the previous
  image is still serving, so it must not break that image: add before you remove
  (new columns nullable or defaulted, renames and drops in a later migration once
  no running image uses the old shape).
- **Credentials.** `supabase link` and `db push` need a Supabase access token
  (`SUPABASE_ACCESS_TOKEN`, or `npx supabase login`) and the project's database
  password (`SUPABASE_DB_PASSWORD`, or the prompt).

```sh
npx supabase link --project-ref <staging-project-ref>
npx supabase db push            # staging first
# deploy the new image to staging and check it
npx supabase link --project-ref <prod-project-ref>
npx supabase db push            # prod only after staging
npx supabase link --project-ref <staging-project-ref>   # re-link staging at once
```

`supabase link` stores the project ref locally (`supabase/.temp`), and a later bare
`db push` targets whatever is linked. Re-link staging right after a prod push, or
push to prod with `npx supabase db push --db-url <prod-connection-string>` without
linking it, so a casual `db push` can never reach prod.
