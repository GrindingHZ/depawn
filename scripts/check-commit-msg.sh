#!/usr/bin/env bash
# commit-msg hook. Rejects anything that is not a single conventional line.
set -uo pipefail

file="$1"
message=$(grep -v '^#' "$file" | sed '/^$/d')
lines=$(wc -l <<< "$message")

fail() { echo "commit rejected: $1"; echo "see docs/12-writing-and-commits.md"; exit 1; }

[ "$lines" -gt 1 ] && fail "commit messages are one line, no body"

grep -qP '[\x{2014}\x{2013}]' <<< "$message" && fail "no em or en dashes"
grep -qiE 'co-authored-by|generated with|signed-off-by' <<< "$message" && fail "no attribution trailers"
grep -qP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' <<< "$message" && fail "no emoji"

pattern='^(feat|fix|test|refactor|chore|docs|perf|ci)\([a-z0-9-]+\): [a-z][^A-Z]*[^.]$'
grep -qE "$pattern" <<< "$message" || fail "expected: type(scope): lowercase imperative summary"

[ "${#message}" -gt 72 ] && fail "header longer than 72 characters"

exit 0
