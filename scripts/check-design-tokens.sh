#!/usr/bin/env bash
# Enforces the token rules in docs/13-design-system.md.
# tokens.css is the only file allowed to hold a raw design value.
set -uo pipefail

target="${1:-.}"
status=0

scan() {
  grep -rnHP \
    --include='*.ts' --include='*.tsx' --include='*.css' \
    --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build --exclude-dir=.git \
    "$1" "$target" 2>/dev/null \
    | grep -v 'packages/ui/src/tokens\.css' \
    | grep -v 'packages/ui/tailwind\.preset\.ts' || true
}

report() {
  echo "$1"
  echo "$2"
  status=1
}

hits=$(scan '#[0-9a-fA-F]{3,8}\b')
[ -n "$hits" ] && report "Raw hex colour found. Use a token from packages/ui/src/tokens.css." "$hits"

hits=$(scan '\b(rgb|rgba|hsl|hsla)\(')
[ -n "$hits" ] && report "Raw colour function found. Use a token." "$hits"

hits=$(scan '\b(bg|text|border|ring|fill|stroke|from|to|via)-\[#')
[ -n "$hits" ] && report "Tailwind arbitrary colour found. Use a semantic token class." "$hits"

hits=$(scan 'font-family\s*:')
[ -n "$hits" ] && report "Hardcoded font-family found. Use --font-heading or --font-body." "$hits"

hits=$(scan '\b(m|mt|mr|mb|ml|mx|my|p|pt|pr|pb|pl|px|py|gap|space-x|space-y)-\[[0-9.]+px\]')
[ -n "$hits" ] && report "Raw pixel spacing found. Use a spacing token." "$hits"

exit $status
