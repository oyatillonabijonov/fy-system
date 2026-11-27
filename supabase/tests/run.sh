#!/usr/bin/env bash
# Runs supabase/tests/*_test.sql, each in its OWN clean database, on a throwaway Postgres in LOCAL Docker
# (or CI) — never on a real server. Tests share no state: run one after another in one database they
# disturb each other.
#
#   supabase/tests/run.sh            every test
#   supabase/tests/run.sh 053 097    only the tests whose file name starts with these
#   REPEAT=20 supabase/tests/run.sh 091   each chosen test 20 times, each time in its own clean copy (flaky hunt)
#
# How: the schema is built ONCE in the `postgres` database (only there does the Supabase image have
# auth.uid(), the realtime publication and pg_cron), then every test gets `CREATE DATABASE tN TEMPLATE
# postgres`. Two traps, both handled below:
#   1. The copy is made by supabase_admin (the image's `postgres` role is not a full superuser and can't
#      end the background sessions on `postgres`), so it must say OWNER postgres — otherwise CREATE inside
#      a test fails on the public schema, silently for anything that swallows errors.
#   2. A template can't have other sessions: connections to `postgres` are closed for the copying
#      (ALLOW_CONNECTIONS false + terminate), then opened again.
# Exit code 0 = every test passed, except those in KNOWN (listed, not counted).
set -uo pipefail

IMAGE=${IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.106}
REPEAT=${REPEAT:-1}
# migrations that fail on this image for a known reason: no storage schema; 042's constraint already exists
EXPECTED_MIGRATION_FAILURES="013 014 016 019 021 025 029 042 048 098 099"
# tests that are red on purpose, with the reason — shown, not counted (a case, not an array: macOS bash 3.2)
known_reason() {
  case "$1" in
  esac
}

root=$(cd "$(dirname "$0")/.." && pwd)
name=fy-test-run-$$
psql_pg() { docker exec "$name" psql -U postgres -v ON_ERROR_STOP=1 "$@"; }
psql_sa() { docker exec -e PGPASSWORD=postgres "$name" psql -h 127.0.0.1 -U supabase_admin -d template1 -qtA "$@"; }

docker run -d --name "$name" --network none -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null || exit 2
trap 'docker rm -f "$name" >/dev/null' EXIT
for _ in $(seq 1 90); do docker exec "$name" pg_isready -U postgres -q 2>/dev/null && break; sleep 2; done
sleep 3
docker exec "$name" mkdir -p /work
docker cp "$root/migrations" "$name:/work/migrations"
docker cp "$root/tests" "$name:/work/tests"   # tests and migrations side by side: \ir ../migrations/… works

# GoTrue isn't in the image: the migration-history table it would own
psql_pg -q -d postgres -c "CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY);" >/dev/null

echo "== schema"
failed=""
for f in "$root"/migrations/*.sql; do
  b=$(basename "$f"); n=${b:0:3}
  if ! psql_pg -q -d postgres -f "/work/migrations/$b" >/dev/null 2>/tmp/fy-mig-err; then
    if [[ " $EXPECTED_MIGRATION_FAILURES " == *" $n "* ]]; then failed+=" $n"
    else echo "migration $b failed unexpectedly:"; grep -m3 ERROR /tmp/fy-mig-err; exit 2; fi
  fi
done
echo "   built; expected failures:${failed:- none}"

tests=()
for f in "$root"/tests/*_test.sql; do
  b=$(basename "$f")
  if [ $# -eq 0 ]; then tests+=("$b"); else for p in "$@"; do [[ $b == "$p"* ]] && tests+=("$b"); done; fi
done
[ ${#tests[@]} -gt 0 ] || { echo "no tests match: $*"; exit 2; }
if [ "$REPEAT" -gt 1 ]; then once=("${tests[@]}"); tests=(); for _ in $(seq 1 "$REPEAT"); do tests+=("${once[@]}"); done; fi

psql_sa -c "ALTER DATABASE postgres ALLOW_CONNECTIONS false" >/dev/null
psql_sa -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'postgres' AND pid <> pg_backend_pid()" >/dev/null
sleep 1
for i in "${!tests[@]}"; do psql_sa -c "CREATE DATABASE t$i TEMPLATE postgres OWNER postgres" >/dev/null || exit 2; done
psql_sa -c "ALTER DATABASE postgres ALLOW_CONNECTIONS true" >/dev/null

echo "== tests"
pass=0; fail=0; known=0
for i in "${!tests[@]}"; do
  b=${tests[$i]}; n=${b:0:3}
  if out=$(psql_pg -d "t$i" -f "/work/tests/$b" 2>&1); then
    pass=$((pass + 1)); printf "  PASS  %s\n" "$b"
  elif [ -n "$(known_reason "$n")" ]; then
    known=$((known + 1)); printf "  KUTILMOQDA  %s — %s\n" "$b" "$(known_reason "$n")"
  else
    fail=$((fail + 1)); printf "  FAIL  %s :: %s\n" "$b" "$(echo "$out" | grep -m1 ERROR | cut -c1-200)"
  fi
done
echo "== $pass passed, $fail failed, $known known (of ${#tests[@]})"
[ "$fail" -eq 0 ]
