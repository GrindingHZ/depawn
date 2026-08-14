#!/usr/bin/env bash
# Runs dependency-cruiser over the API source. Skips cleanly before the API
# workspace exists so early tooling commits stay green.
set -uo pipefail

if [ ! -d "apps/api/src" ]; then
  echo "boundaries: apps/api/src not present yet, skipping"
  exit 0
fi

pnpm exec depcruise apps/api/src --config .dependency-cruiser.cjs
