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

# The scope list in docs/12 was advisory until a slice invented four scopes
# nobody noticed. Drawn from the module and app names, nothing invented.
scopes='domain|ledger|custody|marketplace|lending|liquidation|accounts|admin'
scopes="$scopes|api|marketplace-ui|vault-console|admin-ui|contracts|ui|e2e"
scopes="$scopes|db|ci|deps|state|move|indexer|flows|demo|events|operations|parameters|seed|config"
scope=$(sed -E 's|^[a-z]+\(([a-z0-9-]+)\).*|\1|' <<< "$message")
grep -qE "^($scopes)$" <<< "$scope" || fail "scope '$scope' is not in the list in docs/12"

[ "${#message}" -gt 72 ] && fail "header longer than 72 characters"

exit 0
