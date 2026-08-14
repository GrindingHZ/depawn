#!/usr/bin/env bash
# Mechanical style checks from docs/12-writing-and-commits.md.
# Catches punctuation and banned phrases only. Judgement stays with the review stage.
set -uo pipefail

target="${1:-.}"
status=0

# These two files quote the banned patterns in order to define them.
self_referential='(docs/12-writing-and-commits\.md|scripts/check-prose\.sh|scripts/check-commit-msg\.sh)'

scan() {
  grep -rnHP \
    --include='*.md' --include='*.ts' --include='*.tsx' \
    --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build --exclude-dir=.git \
    "$1" "$target" 2>/dev/null | grep -vE "$self_referential" || true
}

report() {
  echo "$1"
  echo "$2"
  status=1
}

hits=$(scan '(*UTF)[\x{2014}\x{2013}]')
[ -n "$hits" ] && report "Em or en dash found. Use a comma, colon, parentheses, or two sentences." "$hits"

hits=$(scan '(*UTF)[\x{2018}\x{2019}\x{201C}\x{201D}\x{2026}]')
[ -n "$hits" ] && report "Curly quote or ellipsis character found. Use straight quotes and full stops." "$hits"

hits=$(scan "(?i)it's worth noting|important to note|at the end of the day|when it comes to|let's dive in|let's explore|delve|seamless|cutting-edge|game-changer|best-in-class|streamline|empower|unlock the|elevate your|not just [^,]*, but")
[ -n "$hits" ] && report "Banned phrase found. See docs/12-writing-and-commits.md." "$hits"

hits=$(scan '(*UTF)[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}]')
[ -n "$hits" ] && report "Emoji found. Remove it." "$hits"

exit $status
