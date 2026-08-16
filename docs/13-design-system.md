# 13. Design System

We use the UI UX Pro Max skill (`nextlevelbuilder/ui-ux-pro-max-skill`) for design intelligence:
style selection, colour palettes, font pairings, chart types, and UX rules.

This document exists because the obvious way to use it is wrong, and the wrong way is invisible
until slice nine when the three apps no longer look like the same product.

## The rule

**Generate the design system once. Freeze it. Never regenerate it.**

The skill is a generator. Generators are non-deterministic. Run it at the start of a slice and you
get a palette. Run it at the start of the next slice and you get a slightly different palette, a
different font pairing, and a different opinion about card elevation. Nothing in the pipeline would
catch this, because every individual slice looks fine in isolation.

So the skill runs in exactly one place, at P0.5, before any UI slice exists. Its output is converted
into design tokens, committed, and treated as read-only from then on. Every subsequent UI slice
consumes the tokens and queries the skill only for component-level patterns, never for colour,
typography, or style direction.

## Installation

```
/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
/plugin install ui-ux-pro-max@ui-ux-pro-max-skill
```

Queries run through the bundled script:

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain <domain>
```

Domains include `style`, `color`, `typography`, `chart`, `landing`, `ux`, and `product`. The
`--design-system` flag runs the full generator. That flag is used once, in P0.5, and is otherwise
banned. Add it to the review checklist.

## P0.5, the design system slice

Sits between P0 (spine) and P1 (ledger). It produces no product behaviour and it is not optional.

### Step 1, generate three surface directions

We have three applications with genuinely different jobs, so we query three times.

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py \
  "peer to peer secured lending marketplace, trustworthy, financial, calm" \
  --design-system -p "Marketplace"

python3 .claude/skills/ui-ux-pro-max/scripts/search.py \
  "warehouse operations terminal, dense, high contrast, keyboard first, fixed screen" \
  --design-system -p "Vault Console"

python3 .claude/skills/ui-ux-pro-max/scripts/search.py \
  "internal risk and reconciliation dashboard, data dense, tabular, neutral" \
  --design-system -p "Admin"
```

Save all three raw outputs to `.claude/work/p05-design-system/generated/`. They are evidence for why
the tokens are what they are, not something the build reads.

### Step 2, reconcile to one token set

Three generated systems, one product. Reconcile by hand, in this order:

- **One colour ramp, shared.** Take the marketplace palette as the base. The vault console and admin
  do not get their own hues. They get different *usage*: heavier weights, tighter spacing, larger
  type sizes for the terminal.
- **Two font families maximum.** One for headings, one for body and UI. If the three generated
  pairings disagree, take the marketplace pairing and drop the others.
- **Semantic naming, not descriptive.** `--color-surface-raised`, not `--color-gray-100`.
  `--color-status-danger`, not `--color-red-600`. The name says what it is for, so a rebrand changes
  values in one file and nothing else.
- **Status colours are fixed by domain, not by taste.** We have loan states, receipt states, and
  reconciliation drift. Map each state group to a semantic status token in P0.5 and never decide it
  again inside a slice.

### Step 3, write the tokens

`packages/ui/src/tokens.css` is the single source of truth. It is the only file in the repository
allowed to contain a raw colour value.

```css
:root {
  --color-surface-base: #f8fafc;
  --color-surface-raised: #ffffff;
  --color-surface-sunken: #eef2f6;

  --color-text-primary: #0f172a;
  --color-text-secondary: #475569;
  --color-text-inverse: #ffffff;

  --color-accent-default: #0f766e;
  --color-accent-hover: #115e59;

  --color-status-neutral: #64748b;
  --color-status-active: #0369a1;
  --color-status-success: #15803d;
  --color-status-warning: #b45309;
  --color-status-danger: #b91c1c;

  --font-heading: 'Space Grotesk', system-ui, sans-serif;
  --font-body: 'Inter', system-ui, sans-serif;

  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;

  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;

  --density-row-height: 2.5rem;
}
```

Density is a token, not a per-app stylesheet. The vault console overrides three or four tokens under
a `[data-surface='terminal']` selector and inherits everything else:

```css
[data-surface='terminal'] {
  --density-row-height: 3rem;
  --space-4: 0.75rem;
  --color-text-secondary: #334155;
}
```

That is the whole mechanism for making a dense operational screen out of the same design system. No
second palette, no second component library.

### Step 4, map tokens into Tailwind

```ts
// packages/ui/tailwind.preset.ts
export default {
  theme: {
    extend: {
      colors: {
        surface: {
          base: 'var(--color-surface-base)',
          raised: 'var(--color-surface-raised)',
          sunken: 'var(--color-surface-sunken)',
        },
        status: {
          neutral: 'var(--color-status-neutral)',
          active: 'var(--color-status-active)',
          success: 'var(--color-status-success)',
          warning: 'var(--color-status-warning)',
          danger: 'var(--color-status-danger)',
        },
      },
      fontFamily: {
        heading: 'var(--font-heading)',
        body: 'var(--font-body)',
      },
    },
  },
};
```

All three apps extend this preset. None of them defines a colour.

### Step 5, build the primitives

`packages/ui` gets the components every app needs, built against tokens:

```
Button  Field  Select  Checkbox  DataTable  Money  Rate  StatusBadge
Card  Dialog  Toast  Skeleton  EmptyState  Stepper  AppShell
```

Query the skill for patterns here, scoped tightly:

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "data table dense readable" --domain ux
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "accessibility focus" --domain ux
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "loading states skeleton" --domain ux
```

Take the guidance. Do not take generated colour values.

### Step 6, write the design brief

`docs/DESIGN-BRIEF.md`, one page, generated once and then read by every UI slice:

- Chosen style name and the one-line reason
- The token table with each token's intended use
- Status colour to domain state mapping, exhaustive
- Typography scale with the heading levels actually in use
- Density rules for the terminal surface
- The five UX rules from the skill that this product cares about most

Every UI slice reads this file in Stage 0 instead of re-querying the skill for direction.

### Exit criteria for P0.5

- `packages/ui/src/tokens.css` committed
- Tailwind preset committed and consumed by all three apps
- Primitives built with unit tests and a Storybook or a static gallery route
- `docs/DESIGN-BRIEF.md` committed
- `scripts/check-design-tokens.sh` passing and wired into `pnpm check`
- The three raw generator outputs archived under `.claude/work/p05-design-system/generated/`

## Amendment, P8c: motion and elevation

The freeze forbids regenerating the system. It does not forbid naming something the system never
named, and the difference matters: regenerating drifts the values every screen already uses, while
adding a token nobody has used yet cannot move anything.

Motion, elevation and easing were never tokenised. Without them a slice that wants a transition has
two choices, both bad: hardcode a duration, which the token check does not catch and which drifts
between screens, or do without motion entirely. So P8c added, and only added:

```
--motion-control  --motion-enter  --motion-panel
--motion-ease-enter  --motion-ease-exit
--elevation-raised  --elevation-overlay
```

The conditions this amendment was made under, which any future one should meet too:

- **Additive only.** No existing token changed value. Every screen renders identically to before.
- **Semantic, like everything else.** `--motion-panel`, not `--duration-240`.
- **Bounded on purpose.** Three durations, two easings, two elevations. A scale nobody can exhaust
  is a scale nobody obeys.
- **Reduced motion is part of the token, not left to each caller.** The durations collapse to zero
  under `prefers-reduced-motion`, so a component cannot forget.

The palette and the typography remain frozen. Wanting a different visual world is still a P0.6
sized project: regenerate, reconcile once, re-freeze.

## Using the skill inside UI slices

Allowed:

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "wizard multi step form" --domain ux
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "dashboard" --domain chart
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "error empty state" --domain ux
```

Banned inside a slice:

- `--design-system`
- `--domain color`
- `--domain typography`
- `--domain style`
- `--domain landing`, since we have no marketing pages in scope

The reviewer checks the slice's brainstorm file for any of these and treats their presence as a
blocking finding.

## Token enforcement

The skill's own guidance is tokens first, then components, because generated UI tends to scatter hex
values across dozens of class strings. We enforce that mechanically rather than trusting it.

`scripts/check-design-tokens.sh` fails on:

- A hex colour in any file under `apps/` or in `packages/ui` outside `tokens.css`
- `rgb(`, `rgba(`, `hsl(` outside `tokens.css`
- A Tailwind arbitrary colour value, meaning `bg-[#...]`, `text-[#...]`, `border-[#...]`
- A hardcoded `font-family` outside `tokens.css`
- A raw `px` value in a margin, padding, or gap utility, since spacing comes from tokens

It runs inside `pnpm check` and on every edit through the `PostToolUse` hook, so a violation surfaces
next to the tool result rather than at review time.

This one check is what keeps the design system real. Without it the tokens exist and nothing uses
them.

## Precedence when guidance conflicts

The skill has opinions. So do our own documents. Order of precedence, highest first:

1. `docs/09-conventions.md`, which owns code style, naming, and the emoji ban
2. `docs/13-design-system.md`, this file, which owns tokens and the freeze rule
3. `docs/DESIGN-BRIEF.md`, which owns the specific chosen values
4. `docs/05-frontend.md`, which owns routing, state, and component structure
5. UI UX Pro Max guidance
6. Anthropic's `frontend-design` skill

If both design skills are installed, UI UX Pro Max wins on colour, typography, and style, because it
is what produced our tokens. Neither one wins on anything covered by items 1 to 4.

Two conflicts worth naming now:

- **Emoji.** The skill's quality checklist already says SVG icons rather than emoji, which matches
  our rule. If any generated snippet contains one, remove it. `scripts/check-prose.sh` will catch it.
- **Raw values in generated snippets.** The skill emits Tailwind with hex values inline, as in
  `bg-[#F97316]`. Every generated snippet is rewritten to token classes before it is committed. The
  token check enforces this.

## Accessibility

The skill supplies contrast and focus guidance. We verify it rather than assume it.

- Every token pair that renders text on a background is contrast-checked in P0.5, and the ratio is
  recorded in `docs/DESIGN-BRIEF.md`. Body text meets WCAG AA at minimum.
- Status is never carried by colour alone. Every `StatusBadge` has a text label. This is a hard rule
  from `docs/05-frontend.md` and it survives any design guidance to the contrary.
- `@axe-core/playwright` runs on the primary route of each app in every pipeline verify stage and
  fails on serious violations.
- The vault console is checked at 1366 by 768 with keyboard navigation only. Staff use a fixed
  terminal, not a laptop with a trackpad.

## Visual regression

Once tokens are frozen, drift becomes detectable. Playwright takes a screenshot of one representative
screen per app and compares against a committed baseline:

- Marketplace: listing detail with a populated offer book
- Vault console: the intake wizard at the appraisal step
- Admin: the reconciliation screen with drift rows present

A visual diff failing is a real failure. The pipeline treats it as a gate failure and goes back to
Stage 3. Updating a baseline is a deliberate commit, `chore(ui): update visual baseline for <reason>`,
never a side effect of a slice.

## What not to do

- **Do not regenerate the design system to fix an ugly screen.** The screen is wrong, not the tokens.
- **Do not add a token mid-slice because a component needs a shade.** Use an existing token or make
  adding the token its own commit with a one-line justification in the message.
- **Do not let the vault console or admin app grow their own palette.** Density overrides only.
- **Do not commit the generator's raw output as documentation.** It is archived evidence.
  `docs/DESIGN-BRIEF.md` is the document.
- **Do not query the skill during the review stage.** The reviewer checks against the brief, not
  against fresh generated opinions.
