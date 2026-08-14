# Review: p05-design-system

Reviewed against docs/13-design-system.md exit criteria, docs/11 stage 4 UI checks, and
docs/09-conventions.md. Verified mechanically on this machine.

Evidence:

- pnpm check: exit 0
- pnpm test:unit: exit 0 (ui package re-run fresh without the turbo cache: 15 files, 26 tests green)
- Token probe: adding bg-[#ff0000] to apps/admin/src makes scripts/check-design-tokens.sh exit 1
  with both the raw hex and arbitrary colour rules firing, confirming the implementer's report
- Contrast ratios: all 13 pairs in docs/DESIGN-BRIEF.md recomputed with the WCAG relative
  luminance formula; every figure matches to two decimal places, none off by more than 0.05
- Exit criteria: tokens.css committed and it is the only file with raw design values; preset
  consumed by all three apps via presets: [preset] in each tailwind.config.ts; fifteen primitives
  each with a spec plus a static /gallery route in the marketplace app; DESIGN-BRIEF.md committed;
  check-design-tokens.sh wired into pnpm check and the PostToolUse hook; three raw generator
  outputs plus reconciliation notes archived under .claude/work/p05-design-system/generated/
- Stage 4 UI checks: no raw colour, font, or pixel spacing outside tokens.css (token check green
  over the repo); StatusBadge requires a label prop and the brief maps every domain state to a
  tone with its state name as text; brainstorm.md and plan.md contain no banned skill query
  (no --design-system invocation, no --domain color/typography/style/landing)
- Prose: no em dashes, curly quotes, or emoji in the brief, the primitives, or the restyled
  routes; the generator archives contain decorative glyphs but they are archived evidence,
  which docs/13 explicitly separates from documentation

## Blocking

- none

## Non-blocking

- formatRate in packages/ui/src/rate.tsx drops the sign for basis points between -1 and -99:
  Math.trunc(-50 / 100) is -0, which renders as "0.50% p.a.". Rates are positive in the current
  domain, but the function accepts any number, so guard or document it before a signed rate appears.
- scripts/check-design-tokens.sh excludes packages/ui/tailwind.preset.ts from every scan even
  though that file holds only var() references today; a raw hex added there later would pass
  undetected. It also scans only .ts, .tsx, and .css, so the Google Fonts URLs in the three
  index.html files sit outside enforcement, and the font choice is now written in four places
  (tokens.css plus three html files).
- The primitives spread ...rest before their own className, so a caller-supplied className,
  which the ButtonHTMLAttributes-style prop types permit, is silently discarded. Consistent and
  arguably intentional for a frozen system, but the type signature promises more than the
  component honours; consider Omit<..., 'className'> to make the contract explicit.
- Dialog has no focus trap or Escape-to-close handling. Brief UX rule 1 makes the product
  keyboard first; acceptable for a static primitive now, worth an entry in docs/OPEN-QUESTIONS.md
  or an upgrade when the first real modal flow lands.
- packages/ui/src/toast.tsx is named after neither of its primary exports (ToastRegion,
  ToastMessage); docs/09 wants the file named after the primary export, so toast-region.tsx.
- formatMoney hardcodes two-decimal minor units (100n) and en-AU grouping. Fine for the AUD-only
  book, but the assumption is invisible at the call site; the comment explains the BigInt choice
  and could name this one too.

## Verdict

APPROVED
