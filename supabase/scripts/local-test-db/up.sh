#!/bin/bash
# Throwaway local Postgres for testing migrations. It never touches the hosted Supabase project.
#
#   supabase/scripts/local-test-db/up.sh            # fresh database with every migration applied
#   supabase/scripts/local-test-db/up.sh 20261114000200   # ...only migrations up to this timestamp
#   supabase/scripts/local-test-db/up.sh stop       # stop the server and delete the data
#   psql -h 127.0.0.1 -p 55432 -U postgres -d app   # connect
#
# Needs a local PostgreSQL (initdb, pg_ctl, psql on PATH; `brew install postgresql@16`). stubs.sql provides small
# stand-ins for the Supabase platform: the anon / authenticated / service_role roles, auth.users and auth.uid(),
# vault, cron, net (requests are recorded in net.http_request_queue, not sent) and storage.
# To act as a user in a test:  set request.jwt.claim.sub = '<user uuid>'; set role authenticated;
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
MIG="$HERE/../../migrations"
DATA="${LOCAL_TEST_DB_DIR:-${TMPDIR:-/tmp}/ipobell-local-test-db}"
PORT="${LOCAL_TEST_DB_PORT:-55432}"

pg_ctl -D "$DATA" stop -m immediate >/dev/null 2>&1 || true
rm -rf "$DATA"
if [ "${1:-}" = "stop" ]; then echo "stopped and removed $DATA"; exit 0; fi

initdb -D "$DATA" -U postgres --no-locale -E UTF8 >/dev/null 2>&1
# Loopback TCP only (a socket path under a long temp directory exceeds the 103-byte limit on macOS).
pg_ctl -D "$DATA" -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -l "$DATA/server.log" -w start >/dev/null
P=(psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PORT" -U postgres)
"${P[@]}" -d postgres -c "create database app" >/dev/null
"${P[@]}" -d app -f "$HERE/stubs.sql" >/dev/null 2>&1

UPTO="${1:-99999999999999}"
for f in $(ls "$MIG"/*.sql | sort); do
  n=$(basename "$f" | cut -d_ -f1)
  if [ "$n" -gt "$UPTO" ]; then continue; fi
  # pg_cron and pg_net are stubbed; skip only their CREATE EXTENSION lines.
  if ! sed -E '/create extension if not exists (pg_cron|pg_net)/d' "$f" | "${P[@]}" -d app >"$DATA/last.out" 2>&1; then
    echo "FAILED: $(basename "$f")"; tail -5 "$DATA/last.out"; exit 1
  fi
  echo "applied $(basename "$f")"
done
echo "ready: psql -h 127.0.0.1 -p $PORT -U postgres -d app"
