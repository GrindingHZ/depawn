#!/usr/bin/env bash
# Fast feedback after every edit. Formats the file and runs the prose check.
set -uo pipefail

input=$(cat)
path=$(jq -r '.tool_input.file_path // empty' <<<"$input")

[ -z "$path" ] && exit 0
[ ! -f "$path" ] && exit 0

case "$path" in
  *.ts|*.tsx|*.json) pnpm exec prettier --write "$path" >/dev/null 2>&1 ;;
esac

case "$path" in
  *.md|*.ts|*.tsx)
    if ! output=$(./scripts/check-prose.sh "$path" 2>&1); then
      echo "$output" >&2
      exit 2
    fi
    ;;
esac

case "$path" in
  *.ts|*.tsx|*.css)
    if ! output=$(./scripts/check-design-tokens.sh "$path" 2>&1); then
      echo "$output" >&2
      exit 2
    fi
    ;;
esac

exit 0
