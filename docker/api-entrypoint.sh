#!/usr/bin/env sh
# Bring the schema up to date, then seed only if there is nothing there.
#
# Seeding unconditionally would empty the database on every `docker compose
# up`, so anyone who restarted the stack would lose whatever they had just
# clicked through. Seeding an empty database is the helpful thing; emptying a
# full one is not, and belongs behind a deliberate `pnpm db:seed`.
set -eu

cd /repo/apps/api

echo "waiting for the database and applying migrations"
until pnpm exec prisma migrate deploy >/dev/null 2>&1; do
  sleep 2
done
echo "schema is up to date"

if [ "${SEED_ON_START:-true}" = "true" ]; then
  # The explicit form rather than `pnpm run db:seed --if-empty`, because pnpm
  # would take the flag for one of its own.
  node -r @swc-node/register prisma/seed.ts --if-empty
else
  echo "seeding skipped: SEED_ON_START is not true"
fi

# `start` rather than `dev`: a file watcher inside a container watches files
# nobody is editing. Demo mode comes from the environment either way.
exec node -r @swc-node/register "src/${API_ENTRY:-main}.ts"
