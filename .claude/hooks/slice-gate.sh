#!/usr/bin/env bash
# Blocks the agent from stopping while the current slice is unfinished.
# Exit 2 is the only code that blocks. Exit 1 is treated as non-blocking.
set -uo pipefail

input=$(cat)

# Without this guard the gate can loop forever on an unfixable failure.
if [ "$(jq -r '.stop_hook_active // false' <<<"$input")" = "true" ]; then
  exit 0
fi

state=.claude/state/STATE.md

if [ ! -f "$state" ]; then
  echo "No .claude/state/STATE.md. Create it and start at P0 per docs/07-phase-plan.md." >&2
  exit 2
fi

if grep -q '^status: complete' "$state"; then
  exit 0
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Uncommitted changes remain. Commit the current task before stopping." >&2
  exit 2
fi

if ! pnpm check >/tmp/gate-check.log 2>&1; then
  echo "pnpm check failed. Fix it before stopping. Output in /tmp/gate-check.log" >&2
  tail -n 20 /tmp/gate-check.log >&2
  exit 2
fi

if ! pnpm test:unit >/tmp/gate-unit.log 2>&1; then
  echo "Unit tests failed. Fix them before stopping. Output in /tmp/gate-unit.log" >&2
  tail -n 20 /tmp/gate-unit.log >&2
  exit 2
fi

if grep -qE '^\s*- \[ \]' .claude/work/*/plan.md 2>/dev/null; then
  echo "The current plan still has open tasks. Continue at Stage 3 of docs/11-execution-pipeline.md." >&2
  exit 2
fi

exit 0
