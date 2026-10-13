#!/usr/bin/env bash
# Smoke-tests a built MAC Recap image against the Story 2.2 I/O matrix:
#   web without gate vars  -> exit 1 naming BASIC_AUTH_USER, port never opened
#   web with gate vars     -> / and /s/x 401 without credentials, / not 401 with them
#   worker                 -> one readiness JSON line, keeps running, exit 0 on SIGTERM/SIGINT,
#                             exit 1 on invalid env
#   ffmpeg -version        -> 6.1.1
#   id -un                 -> pwuser
# Usage: scripts/smoke-image.sh <image-tag>. Needs docker, curl and jq. Exits non-zero on any failure.
set -uo pipefail

IMAGE="${1:?usage: scripts/smoke-image.sh <image-tag>}"
PREFIX="mac-recap-smoke-$$"
TIMEOUT=60

# Dummy values: nothing contacts Supabase at boot.
SUPABASE_ENV=(
  -e SUPABASE_URL=http://127.0.0.1:54321
  -e SUPABASE_PUBLISHABLE_KEY=smoke-publishable
  -e SUPABASE_SECRET_KEY=smoke-secret
)
GATE_USER=smoke
GATE_PASSWORD=smoke-pass
GATE_ENV=(-e "BASIC_AUTH_USER=$GATE_USER" -e "BASIC_AUTH_PASSWORD=$GATE_PASSWORD")

# Next prints its banner, Local/Network URLs and "Ready" only once it listens.
LISTEN_PATTERN='Ready|Local:|Network:|Next\.js|listening'

failures=0
pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*" >&2; failures=$((failures + 1)); }

cleanup() {
  docker ps -aq --filter "name=^${PREFIX}-" | xargs -r docker rm -f >/dev/null 2>&1 || true
}
trap cleanup EXIT

dump_logs() { echo "--- logs of $1 ---" >&2; docker logs "$1" >&2 2>&1 || true; echo "---" >&2; }
running() { [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" = "true" ]; }
exit_code() { docker inspect -f '{{.State.ExitCode}}' "$1"; }
# Every HTTP call is bounded so a server that accepts but never answers cannot hang the script.
http() { curl -s --connect-timeout 5 --max-time 10 "$@"; }

# Waits until the container stops; fails the row if it is still running after TIMEOUT.
wait_stopped() {
  local name="$1" i
  for ((i = 0; i < TIMEOUT; i++)); do
    running "$name" || return 0
    sleep 1
  done
  return 1
}

# Waits until the container logs match a pattern (or the container stops).
wait_for_log() {
  local name="$1" pattern="$2" i
  for ((i = 0; i < TIMEOUT; i++)); do
    # Read the logs first: with pipefail, `grep -q` exiting early can SIGPIPE docker logs and fail a match.
    grep -Eq "$pattern" <<<"$(docker logs "$name" 2>&1)" && return 0
    running "$name" || return 1
    sleep 1
  done
  return 1
}

# --- Web, gate vars missing: exits 1 naming the var; the port never opens ------
web_ungated() {
  local name="$PREFIX-web-ungated" logs code
  docker run -d --name "$name" "${SUPABASE_ENV[@]}" "$IMAGE" >/dev/null || { fail "web ungated: docker run"; return; }
  if ! wait_stopped "$name"; then
    fail "web ungated: still running after ${TIMEOUT}s"
    dump_logs "$name"
    return
  fi
  code="$(exit_code "$name")"
  logs="$(docker logs "$name" 2>&1)"
  [ "$code" = "1" ] && pass "web ungated: exit 1" || fail "web ungated: exit $code, expected 1"
  grep -q "BASIC_AUTH_USER" <<<"$logs" && pass "web ungated: names BASIC_AUTH_USER" \
    || fail "web ungated: log does not name BASIC_AUTH_USER"
  if grep -Eq "$LISTEN_PATTERN" <<<"$logs"; then
    fail "web ungated: server reached listen"
  else
    pass "web ungated: no listening line (port never opened)"
  fi
  [ "$code" = "1" ] || dump_logs "$name"
}

# --- Web, gated: 401 without credentials, not 401 (nor 5xx) with them ---------
web_gated() {
  local name="$PREFIX-web-gated" port base status i
  docker run -d --name "$name" -p 127.0.0.1::3000 "${SUPABASE_ENV[@]}" "${GATE_ENV[@]}" "$IMAGE" >/dev/null \
    || { fail "web gated: docker run"; return; }
  port="$(docker port "$name" 3000/tcp | head -n1 | sed 's/.*://')"
  base="http://127.0.0.1:$port"
  status=000
  for ((i = 0; i < TIMEOUT; i++)); do
    running "$name" || break
    status="$(http -o /dev/null -w '%{http_code}' "$base/" || true)"
    [ "$status" != "000" ] && break
    sleep 1
  done
  if [ "$status" = "000" ]; then
    fail "web gated: never answered on port 3000"
    dump_logs "$name"
    return
  fi

  local path
  for path in / /s/x; do
    status="$(http -o /dev/null -w '%{http_code}' "$base$path")"
    [ "$status" = "401" ] && pass "web gated: $path without credentials -> 401" \
      || fail "web gated: $path without credentials -> $status, expected 401"
  done
  http -D - -o /dev/null "$base/" | grep -qi '^WWW-Authenticate: Basic' \
    && pass "web gated: 401 carries a Basic challenge" || fail "web gated: no WWW-Authenticate: Basic header"

  status="$(http -o /dev/null -w '%{http_code}' -u "$GATE_USER:$GATE_PASSWORD" "$base/")"
  if [ "$status" != "401" ] && [ "$status" != "000" ] && [ "$status" -lt 500 ]; then
    pass "web gated: / with credentials -> $status"
  else
    fail "web gated: / with credentials -> $status, expected not 401 and below 500"
  fi

  # Positive control for web_ungated: the listening pattern must match a server that did listen.
  if grep -Eq "$LISTEN_PATTERN" <<<"$(docker logs "$name" 2>&1)"; then
    pass "web gated: listening line present (ungated check is not vacuous)"
  else
    fail "web gated: no line matches the listening pattern; update LISTEN_PATTERN"
    dump_logs "$name"
  fi
  running "$name" || { fail "web gated: process exited"; dump_logs "$name"; }
}

# --- Worker: readiness line, keeps running, exits 0 on SIGTERM / SIGINT --------
worker_signal() {
  local signal="$1" name ready code
  name="$PREFIX-worker-$(tr '[:upper:]' '[:lower:]' <<<"$signal")"
  docker run -d --name "$name" "${SUPABASE_ENV[@]}" "$IMAGE" node dist/worker.js >/dev/null \
    || { fail "worker $signal: docker run"; return; }
  if ! wait_for_log "$name" '"msg":"worker ready"'; then
    fail "worker $signal: no readiness line"
    dump_logs "$name"
    return
  fi
  ready="$(docker logs "$name" 2>&1 | grep -c '"msg":"worker ready"')"
  [ "$ready" = "1" ] && pass "worker $signal: one readiness line" || fail "worker $signal: $ready readiness lines"
  if docker logs "$name" 2>&1 | grep '"msg":"worker ready"' | head -n1 \
    | jq -e '.level == "info" and .msg == "worker ready"' >/dev/null 2>&1; then
    pass "worker $signal: readiness line is JSON"
  else
    fail "worker $signal: readiness line is not a JSON info entry"
  fi
  sleep 3
  running "$name" && pass "worker $signal: keeps running" || { fail "worker $signal: exited while idle"; dump_logs "$name"; return; }

  docker kill --signal "$signal" "$name" >/dev/null
  if ! wait_stopped "$name"; then
    fail "worker $signal: still running ${TIMEOUT}s after $signal"
    return
  fi
  code="$(exit_code "$name")"
  [ "$code" = "0" ] && pass "worker $signal: exit 0" || { fail "worker $signal: exit $code, expected 0"; dump_logs "$name"; }
}

worker_invalid_env() {
  local name="$PREFIX-worker-noenv" code
  docker run -d --name "$name" "$IMAGE" node dist/worker.js >/dev/null || { fail "worker invalid env: docker run"; return; }
  wait_stopped "$name" || { fail "worker invalid env: still running"; return; }
  code="$(exit_code "$name")"
  [ "$code" = "1" ] && pass "worker invalid env: exit 1" || { fail "worker invalid env: exit $code, expected 1"; dump_logs "$name"; }
}

# --- Image facts ---------------------------------------------------------------
ffmpeg_version() {
  local out
  out="$(docker run --rm --name "$PREFIX-ffmpeg" "$IMAGE" ffmpeg -version 2>&1 | head -n1)"
  grep -q "ffmpeg version 6\.1\.1" <<<"$out" && pass "ffmpeg: $out" || fail "ffmpeg: '$out', expected 6.1.1"
}

image_user() {
  local user
  user="$(docker run --rm --name "$PREFIX-user" "$IMAGE" id -un 2>&1)"
  [ "$user" = "pwuser" ] && pass "user: pwuser" || fail "user: '$user', expected pwuser"
}

web_ungated
web_gated
worker_signal SIGTERM
worker_signal SIGINT
worker_invalid_env
ffmpeg_version
image_user

if [ "$failures" -gt 0 ]; then
  echo "$failures smoke check(s) failed" >&2
  exit 1
fi
echo "All smoke checks passed"
