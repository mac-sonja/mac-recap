#!/usr/bin/env bash
# Runs the DB test suite (test/db/**) against the local Supabase stack.
# Connection details come from `supabase status -o env`, mapped onto the app's
# variable names, so no local key is hard-coded. Needs a running stack
# (`npm run db:start`); fails fast with that hint when `supabase status` fails.
# Usage: scripts/test-db.sh [vitest args...] (normally via `npm run test:db`).
set -euo pipefail

cd "$(dirname "$0")/.."

if ! status_env="$(npx --no-install supabase status -o env \
  --override-name api.url=SUPABASE_URL \
  --override-name auth.publishable_key=SUPABASE_PUBLISHABLE_KEY \
  --override-name auth.secret_key=SUPABASE_SECRET_KEY \
  --override-name db.url=SUPABASE_DB_URL 2>&1)"; then
  echo "$status_env" >&2
  echo "" >&2
  echo "test:db: could not read \`supabase status\` (output above). Most likely no local stack is running: start it with \`npm run db:start\` (needs Docker), then rerun \`npm run test:db\`." >&2
  exit 1
fi

# Keep only KEY=VALUE lines (the CLI may print notices such as stopped services).
assignments="$(printf '%s\n' "$status_env" | grep -E '^[A-Z_][A-Z0-9_]*=' || true)"
set -a
eval "$assignments"
set +a

missing=()
for name in SUPABASE_URL SUPABASE_PUBLISHABLE_KEY SUPABASE_SECRET_KEY SUPABASE_DB_URL; do
  [[ -n "${!name:-}" ]] || missing+=("$name")
done
if ((${#missing[@]} > 0)); then
  echo "test:db: \`supabase status\` did not report ${missing[*]}. Is the stack fully started? Try \`npm run db:start\`." >&2
  exit 1
fi

exec npx --no-install vitest run --config vitest.db.config.mts "$@"
