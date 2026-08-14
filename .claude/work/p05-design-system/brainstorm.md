# p05-design-system brainstorm

## What this slice changes

Runs the UI UX Pro Max generator exactly once per surface, archives the three raw outputs,
reconciles them by hand into one frozen token set in `packages/ui/src/tokens.css` plus the shared
Tailwind preset, builds the fifteen primitives from `docs/13-design-system.md` with unit tests and
a static gallery route, writes `docs/DESIGN-BRIEF.md` with the token table and contrast ratios,
and wires all three apps to the preset. The token check script is already part of `pnpm check`.

## Files touched

New: `.claude/work/p05-design-system/generated/*`, `packages/ui/` (package files, `src/tokens.css`,
`tailwind.preset.ts`, fifteen component files, specs), `docs/DESIGN-BRIEF.md`, a `/gallery` route
in the marketplace app, Tailwind wiring in each app.

Modified: the three apps' configs and login screens to consume tokens, root lockfile.

## Approaches

Tailwind 3 with a JS preset versus Tailwind 4 CSS-first. Chosen: Tailwind 3, because
`docs/05-frontend.md` and `docs/13-design-system.md` both name `packages/ui/tailwind.preset.ts`
as the mechanism and the preset file is what the freeze rule protects. Reconciliation follows
docs/13 exactly: marketplace palette is the base, staff surfaces get density overrides under
`[data-surface='terminal']`, two font families, semantic names only.

## What could break

The generator is non-deterministic; its output is archived as evidence and never re-run. Unit
tests for primitives need a DOM: `@testing-library/react` plus `jsdom` under Vitest in the ui
package. The design token check bans raw values outside `tokens.css`; every generated snippet is
rewritten to token classes before commit.

## Ambiguity

Visual regression baselines name screens (listing detail with offer book, intake wizard,
reconciliation drift) that do not exist until P3, P2, and P7, so baselines are added when those
screens land; the P0.5 exit criteria in `docs/07-phase-plan.md` do not require them. The gallery
route lives in the marketplace app behind `/gallery`, since no Storybook is in the stack.
