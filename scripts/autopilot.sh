#!/usr/bin/env bash
# Runs the pipeline in docs/11-execution-pipeline.md until STATE.md reports complete.
# A fresh session per iteration keeps context small and makes a crash cost one loop.
set -uo pipefail

mkdir -p .claude/state
log=.claude/state/run.log
iteration=0

while true; do
  if grep -q '^status: complete' .claude/state/STATE.md 2>/dev/null; then
    echo "pipeline complete after $iteration iterations"
    break
  fi

  iteration=$((iteration + 1))
  echo "=== iteration $iteration $(date -u +%FT%TZ) ===" | tee -a "$log"

  claude -p "$(cat .claude/prompts/loop.md)" \
    --permission-mode acceptEdits \
    --output-format stream-json \
    --verbose \
    2>&1 | tee -a "$log"

  sleep 2
done
