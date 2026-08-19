# The Vault Floor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the marketplace's page-per-screen routing with one persistent, linked workspace that reads like a market where the product is a market, and keeps the collateral in front of the decision everywhere else.

**Architecture:** A dark `[data-surface='floor']` token scope added additively to the existing frozen light palette. New presentational components in `packages/ui`, all consuming tokens only. One workspace route in the marketplace app whose selection lives in a TanStack Router search param, so every pane reads the same source and no pane owns state another pane needs. Two new read-only query endpoints for the category index and the activity tape.

**Tech Stack:** TypeScript strict, React 19, TanStack Router + Query, Tailwind 3.4, Vitest, Testing Library, NestJS, Prisma, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-19-vault-floor-design.md`

## Global Constraints

- Tokens only. No raw hex, `rgb()`, `hsl()`, arbitrary Tailwind colour, or hardcoded `font-family` outside `packages/ui/src/tokens.css`. `scripts/check-design-tokens.sh` enforces this.
- Prose rules apply to comments, docs and UI copy. No em or en dashes, no curly quotes, no ellipsis character, no emoji, no banned phrases. `scripts/check-prose.sh` enforces this.
- Commits are one line, `type(scope): lowercase imperative summary`, max 72 characters, scope drawn from the list in `scripts/check-commit-msg.sh`. No body, no trailers, no attribution.
- No `any`, no non-null assertion outside test fixtures, no `as` casts to silence the compiler.
- Money is `bigint` minor units with an explicit currency. Never `number`. Percentages are integer basis points.
- Nothing in `apps/api/src/domain/` may import infrastructure. `scripts/check-boundaries.sh` enforces this.
- Stay on Tailwind 3.4. Do not upgrade to v4.
- Run `pnpm check` before considering any task complete.

## File Structure

```
packages/ui/src/
  tokens.css                     MODIFY  floor scope, border-strong, market tokens
  market-delta.tsx               NEW     role-bound direction and colour
  market-delta.spec.tsx          NEW
  offer-book.tsx                 NEW     depth ladder
  offer-book.spec.tsx            NEW
  offer-depth.ts                 NEW     pure cumulative accumulation
  offer-depth.spec.ts            NEW
  rate-series.ts                 NEW     pure stepped series derivation
  rate-series.spec.ts            NEW
  rate-history.tsx               NEW     stepped SVG chart
  rate-history.spec.tsx          NEW
  lifecycle-spine.tsx            NEW     role-aware stage rail
  lifecycle-spine.spec.tsx       NEW
  collateral-row.tsx             NEW     browse row and card
  collateral-row.spec.tsx        NEW
  index-strip.tsx                NEW     category rate index
  index-strip.spec.tsx           NEW
  tape.tsx                       NEW     cross-listing activity strip
  tape.spec.tsx                  NEW
  workspace.tsx                  NEW     two-pane frame
  workspace.spec.tsx             NEW
  contrast.spec.ts               NEW     asserts the recorded ratio tables
  index.ts                       MODIFY  export the new components
packages/ui/tailwind.preset.ts   MODIFY  expose new tokens as utilities

packages/contracts/src/
  market.ts                      NEW     index and tape schemas
  client/market-client.ts        NEW     fetchMarketIndex, fetchMarketTape
  index.ts                       MODIFY

apps/api/src/
  domain/ports/market-queries.port.ts                        NEW
  infrastructure/persistence/queries/prisma-market-queries.ts NEW
  modules/marketplace/http/market.controller.ts              NEW
  modules/marketplace/marketplace-api.module.ts              MODIFY
  infrastructure/persistence/persistence.module.ts           MODIFY

apps/marketplace/src/
  routes/listings.index.tsx      REWRITE the workspace
  routes/listings.$listingId.tsx REWRITE thin redirect into the workspace
  market-shell.tsx               MODIFY  floor scope, workspace nav
  workspace-selection.ts         NEW     search param schema and helpers
  role-of-listing.ts             NEW     derives borrower or lender
  role-of-listing.spec.ts        NEW
  market-keys.ts                 MODIFY  query keys for index and tape

docs/                            13-design-system.md, DESIGN-BRIEF.md,
                                 05-frontend.md, 10-flows.md, OPEN-QUESTIONS.md
e2e/tests/                       marketplace.workspace.spec.ts NEW
                                 accessibility.spec.ts MODIFY
```

---

### Task 1: The floor token scope

**Files:**
- Modify: `packages/ui/src/tokens.css`
- Modify: `packages/ui/tailwind.preset.ts`
- Test: `packages/ui/src/contrast.spec.ts`
- Modify: `docs/13-design-system.md`, `docs/DESIGN-BRIEF.md`

**Interfaces:**
- Produces: CSS custom properties under `[data-surface='floor']`; Tailwind utilities `edge-strong`, `market-favourable`, `market-adverse`, `market-flat`, `h-row-floor`.

- [ ] **Step 1: Write the failing contrast test**

`packages/ui/src/contrast.spec.ts` parses `tokens.css`, extracts the `[data-surface='floor']` block, and asserts every recorded pair meets its threshold. Test cases: text-primary on each of the three surfaces at 4.5; text-secondary on each at 4.5; each status colour on base at 4.5; border-strong on base and raised at 3.0. It must read the values out of the stylesheet rather than restating them, or it proves nothing.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @depawn/ui test:unit -- contrast`
Expected: FAIL, no `[data-surface='floor']` block found.

- [ ] **Step 3: Add the floor scope to tokens.css**

Additive only. Nothing under `:root` changes value. Add `--color-border-strong` to `:root` as well as to the floor scope, since it is a gap in the light system too.

- [ ] **Step 4: Expose the new tokens in the Tailwind preset**

`edge.strong`, `market.favourable`, `market.adverse`, `market.flat`, `height.row-floor`.

- [ ] **Step 5: Run the test and the gates**

Run: `pnpm --filter @depawn/ui test:unit -- contrast` then `pnpm check`
Expected: PASS, PASS.

- [ ] **Step 6: Amend the design system docs**

`docs/13-design-system.md` gains a P0.6 amendment section: what a palette fork requires, why `floor` and not `terminal`, and that a second fork needs another amendment. `docs/DESIGN-BRIEF.md` gains the floor palette and its contrast table.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(ui): add the floor token scope"
```

---

### Task 2: MarketDelta, colour bound to role

**Files:**
- Create: `packages/ui/src/market-delta.tsx`, `packages/ui/src/market-delta.spec.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Produces:
```ts
export type MarketRole = 'borrower' | 'lender';
export interface MarketDeltaProps {
  readonly currentBasisPoints: number;
  readonly previousBasisPoints: number | null;
  readonly role: MarketRole;
  readonly label?: string;
}
export function MarketDelta(props: MarketDeltaProps): ReactElement;
export function directionOf(current: number, previous: number | null): 'down' | 'up' | 'flat';
export function toneFor(direction: 'down' | 'up' | 'flat', role: MarketRole):
  'favourable' | 'adverse' | 'flat';
```

- [ ] **Step 1: Write the failing tests**

The load-bearing test: the same falling delta renders `market-favourable` for a borrower and `market-adverse` for a lender. Plus: a rising delta inverts both; a null previous renders flat with no arrow; the arrow glyph is identical in both roles, since direction is arithmetic; the numeric value is identical in both roles.

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm --filter @depawn/ui test:unit -- market-delta`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`toneFor` is a pure lookup, not a conditional chain: falling is favourable to a borrower and adverse to a lender, rising is the reverse, flat is flat for both. Render the arrow and the value in one `<span>` with `tabular-nums`, and carry the meaning in text for screen readers so colour is never the only signal.

- [ ] **Step 4: Run and watch it pass**

Run: `pnpm --filter @depawn/ui test:unit -- market-delta`

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ui): bind rate direction colour to the reader"
```

---

### Task 3: Depth and series derivations

**Files:**
- Create: `packages/ui/src/offer-depth.ts`, `packages/ui/src/offer-depth.spec.ts`
- Create: `packages/ui/src/rate-series.ts`, `packages/ui/src/rate-series.spec.ts`

**Interfaces:**
- Produces:
```ts
export interface DepthRow {
  readonly offerId: string;
  readonly annualPercentageRateBasisPoints: number;
  readonly principalMinorUnits: bigint;
  readonly cumulativeMinorUnits: bigint;
  readonly cumulativeShare: number;   // 0..1 of the deepest row
  readonly isBest: boolean;
}
export function accumulateDepth(
  offers: readonly { id: string; annualPercentageRateBasisPoints: number;
                     principal: { minorUnits: string } }[],
): readonly DepthRow[];

export interface RatePoint { readonly atEpochMs: number; readonly basisPoints: number; }
export function bestRateSeries(
  offers: readonly { createdAt: string; annualPercentageRateBasisPoints: number }[],
): readonly RatePoint[];
```

- [ ] **Step 1: Write the failing tests**

`accumulateDepth`: sorts ascending by rate; accumulates in `bigint`, never `number`; marks exactly one best row; an empty list returns an empty array; ties on rate keep a stable order; `cumulativeShare` of the deepest row is exactly 1.
`bestRateSeries`: returns the running best rate over time, so the series is monotonically non-increasing; an offer worse than the standing best adds no point; an empty list returns an empty array; a single offer returns one point.

- [ ] **Step 2: Run and watch them fail**

Run: `pnpm --filter @depawn/ui test:unit -- offer-depth rate-series`

- [ ] **Step 3: Implement both as pure functions**

No React, no formatting, no dates beyond parsing to epoch milliseconds. These are the pieces most likely to be wrong and the cheapest to test in isolation.

- [ ] **Step 4: Run and watch them pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ui): derive offer depth and the best rate series"
```

---

### Task 4: OfferBook

**Files:**
- Create: `packages/ui/src/offer-book.tsx`, `packages/ui/src/offer-book.spec.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Consumes: `accumulateDepth` (Task 3), `MarketRole` (Task 2).
- Produces: `export function OfferBook(props: OfferBookProps): ReactElement` with `offers`, `role`, `selectedOfferId`, `onSelectOffer`, `currency`.

- [ ] **Step 1: Write the failing tests**

Renders one row per offer, rate ascending. The best row is marked by text and by a leading marker, not by colour alone. Cumulative bar width matches `cumulativeShare`. Clicking a row calls `onSelectOffer` with that id. An empty book renders the empty state, not a bare table. Rows are `<button>` elements so they are keyboard reachable.

- [ ] **Step 2: Run and watch it fail**
- [ ] **Step 3: Implement**

A table with `tabular-nums`, 36px rows via `h-row-floor`, sticky header. The depth bar is an absolutely positioned element behind the rate cell at `--depth-share` percent width, set through a CSS custom property rather than an inline colour.

- [ ] **Step 4: Run and watch it pass**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ui): add the offer book depth ladder"
```

---

### Task 5: RateHistory

**Files:**
- Create: `packages/ui/src/rate-history.tsx`, `packages/ui/src/rate-history.spec.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Consumes: `RatePoint`, `bestRateSeries` (Task 3).
- Produces: `export function RateHistory(props: { points: readonly RatePoint[]; role: MarketRole; highlightAtEpochMs?: number }): ReactElement`

Hand-rolled SVG rather than Recharts. The series is a stepped line with under twenty points; a charting dependency would add weight, its own theming layer, and reopen the Tailwind v4 question for no gain. This deviates from the spec's component table and the spec is amended in Task 12.

- [ ] **Step 1: Write the failing tests**

A stepped path: for n points the path has 2n-1 segments, horizontal then vertical, never diagonal. Fewer than two points renders the empty state rather than a broken axis. `highlightAtEpochMs` marks the matching point. The chart carries an accessible description naming the first and last rate, since an SVG polyline is invisible to a screen reader.

- [ ] **Step 2: Run and watch it fail**
- [ ] **Step 3: Implement**

`viewBox` with `preserveAspectRatio="none"`, stroke from `currentColor` so the role tone is inherited from a parent class rather than passed as a colour.

- [ ] **Step 4: Run and watch it pass**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ui): chart the best rate as a stepped line"
```

---

### Task 6: LifecycleSpine

**Files:**
- Create: `packages/ui/src/lifecycle-spine.tsx`, `packages/ui/src/lifecycle-spine.spec.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Produces:
```ts
export type SpineStage = { readonly key: string; readonly label: string;
  readonly state: 'done' | 'current' | 'ahead' | 'risk' };
export function spineFor(role: MarketRole, status: string, isAtRisk: boolean):
  readonly SpineStage[];
export function LifecycleSpine(props: { role: MarketRole; stages: readonly SpineStage[];
  onSelectStage?: (key: string) => void }): ReactElement;
```

- [ ] **Step 1: Write the failing tests**

`spineFor` returns borrower stages Receipt, Listed, Funded, Maturing, Redeemed and lender stages Offered, Competing, Funded, Default risk, Settled. Exactly one stage is `current`. A defaulted loan marks the lender's risk stage. Stage state is carried in text, not only by the dot colour. Clicking a stage calls `onSelectStage`.

- [ ] **Step 2: Run and watch it fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run and watch it pass**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ui): add the role aware lifecycle spine"
```

---

### Task 7: CollateralRow and CollateralCard

**Files:**
- Create: `packages/ui/src/collateral-row.tsx`, `packages/ui/src/collateral-row.spec.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Produces: `CollateralRow` and `CollateralCard`, both taking the same `CollateralItem` shape (listingId, itemDescription, itemCategory, appraisedValue, requestedPrincipal, loanToValueBasisPoints, bestRateBasisPoints, expiresAt, hasPhotograph, receiptId, relationship).

- [ ] **Step 1: Write the failing tests**

Both render the item description as the identity, never an id. The row shows the photograph when `hasPhotograph`, and reserves nothing when it does not. The relationship marker reads as text (`yours`, `you offered`, `you funded`). Selected state is conveyed by more than colour. Card is the gallery form of the same data.

- [ ] **Step 2: Run and watch it fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run and watch it pass**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ui): add collateral row and gallery card"
```

---

### Task 8: Market index and tape endpoints

**Files:**
- Create: `apps/api/src/domain/ports/market-queries.port.ts`
- Create: `apps/api/src/infrastructure/persistence/queries/prisma-market-queries.ts`
- Create: `apps/api/src/modules/marketplace/http/market.controller.ts`
- Create: `packages/contracts/src/market.ts`, `packages/contracts/src/client/market-client.ts`
- Modify: `packages/contracts/src/index.ts`, `apps/api/src/modules/marketplace/marketplace-api.module.ts`, `apps/api/src/infrastructure/persistence/persistence.module.ts`
- Test: `apps/api/test/market-queries.integration.spec.ts`

**Interfaces:**
- Produces:
```
GET /api/v1/market/index   -> { categories: [{ category, averageRateBasisPoints,
                                 previousAverageRateBasisPoints, liveListings }] }
GET /api/v1/market/tape?limit=  -> { events: [{ at, kind, listingId, itemDescription,
                                     rateBasisPoints, amount }] }
```
`kind` is `OFFER_PLACED` or `LOAN_ORIGINATED`.

- [ ] **Step 1: Write the failing integration tests**

Index returns one entry per category that has a live listing, with the average taken over pending offers. Tape returns events newest first, respects `limit`, and caps it. Both require a session. Neither exposes a listing that is not `ACTIVE`, so the tape cannot be used to enumerate draft or cancelled listings.

- [ ] **Step 2: Run and watch them fail**

Run: `pnpm --filter @depawn/api test:integration -- market-queries`

- [ ] **Step 3: Implement the port, the Prisma query, the controller and the client**

Read models only. Flat DTOs, no aggregate hydration. The port lives in the domain and names no Prisma type.

- [ ] **Step 4: Run and watch them pass**
- [ ] **Step 5: Run the boundary check**

Run: `bash scripts/check-boundaries.sh`

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(marketplace): serve the category index and activity tape"
```

---

### Task 9: IndexStrip and Tape components

**Files:**
- Create: `packages/ui/src/index-strip.tsx`, `packages/ui/src/index-strip.spec.tsx`
- Create: `packages/ui/src/tape.tsx`, `packages/ui/src/tape.spec.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Write the failing tests**

IndexStrip renders one entry per category with a `MarketDelta` bound to the reader's role, and calls `onSelectCategory` when clicked. Tape renders newest first, each line naming the item by description, and calls `onSelectListing`. Both render an empty state rather than collapsing when the query returned nothing, because the spec requires them to degrade to absent without breaking the layout.

- [ ] **Step 2: Run and watch them fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run and watch them pass**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ui): add the index strip and activity tape"
```

---

### Task 10: The workspace

**Files:**
- Create: `packages/ui/src/workspace.tsx`, `packages/ui/src/workspace.spec.tsx`
- Create: `apps/marketplace/src/workspace-selection.ts`
- Create: `apps/marketplace/src/role-of-listing.ts`, `apps/marketplace/src/role-of-listing.spec.ts`
- Rewrite: `apps/marketplace/src/routes/listings.index.tsx`
- Rewrite: `apps/marketplace/src/routes/listings.$listingId.tsx`
- Modify: `apps/marketplace/src/market-shell.tsx`, `apps/marketplace/src/market-keys.ts`

**Interfaces:**
- Consumes: every component from Tasks 2 to 9.
- Produces: the `/listings` route rendering the workspace; `?listing=`, `?density=`, `?stage=`, `?category=` search params.

- [ ] **Step 1: Write the failing role test**

`roleOfListing(listing, accountId, myOffers)` returns `borrower` when the account owns the listing, `lender` otherwise. Tested independently of React.

- [ ] **Step 2: Write the failing workspace test**

`Workspace` renders both panes, and renders the detail pane's empty prompt when no listing is selected rather than a spinner.

- [ ] **Step 3: Run and watch them fail**
- [ ] **Step 4: Implement selection, role derivation and the workspace frame**

Selection is a router search param validated with Zod. The detail pane reads the selected id from the router, not from a prop threaded down.

- [ ] **Step 5: Rewrite the two routes**

`/listings` becomes the workspace. `/listings/$listingId` becomes a redirect to `/listings?listing=$listingId`, so every existing link, the demo runbook and any bookmark still resolve.

- [ ] **Step 6: Put the marketplace on the floor scope**

`data-surface="floor"` on the marketplace shell only. Vault console and admin are untouched.

- [ ] **Step 7: Run the unit tests and the gates**

Run: `pnpm --filter @depawn/ui test:unit` then `pnpm check`

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(marketplace-ui): assemble the vault floor workspace"
```

---

### Task 11: Ops console modernisation

**Files:**
- Modify: `apps/vault-console/src/console-shell.tsx`, `apps/admin/src/admin-navigation.tsx` and their route files as needed

Density and the new component layer only. Light palette. No workspace, no dark scope, no change to their information architecture.

- [ ] **Step 1: Adopt the shared components where they replace bespoke markup**
- [ ] **Step 2: Run the full unit and integration suites**

Run: `pnpm test`

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(vault-console): adopt the shared dense components"
```

---

### Task 12: Documentation and end to end

**Files:**
- Modify: `docs/05-frontend.md`, `docs/10-flows.md`, `docs/OPEN-QUESTIONS.md`, `docs/DEMO.md`
- Modify: `docs/superpowers/specs/2026-08-19-vault-floor-design.md` (the Recharts deviation from Task 5)
- Create: `e2e/tests/marketplace.workspace.spec.ts`
- Modify: `e2e/tests/accessibility.spec.ts`

- [ ] **Step 1: Write the workspace end to end test**

Select a listing in browse and assert the detail pane, offer book and spine all follow. Reload and assert the same view is restored from the URL. Sign in as the borrower, then as a lender, and assert the same listing renders opposite tone tokens.

- [ ] **Step 2: Point the accessibility test at the workspace route**

The P8a review found an axe audit scanning a route that did not exist and reporting green. Assert the page has the expected heading before running axe, so an empty page fails loudly.

- [ ] **Step 3: Update the docs**

Q-027 records that the split was revisited and why. `docs/DEMO.md` step 2 gets the new click path.

- [ ] **Step 4: Run everything**

Run: `pnpm check && pnpm test && pnpm test:e2e`

- [ ] **Step 5: Commit**

```bash
git commit -m "docs(flows): record the workspace and revisit q-027"
```

---

## Self-Review

**Spec coverage.** Layout Task 10; role colour Task 2; spine Task 6; offer book Tasks 3 and 4; rate history Tasks 3 and 5; browse density toggle Task 7; index and tape Tasks 8 and 9; palette and amendment Task 1; backend read models Task 8; error and empty states are asserted inside the component tasks that own them and in Task 10 step 2; testing Task 12; ops modernisation Task 11; docs Task 12.

**Deviation.** The spec's component table names Recharts for `RateHistory`. Task 5 hand-rolls SVG instead, for the reasons given there, and Task 12 amends the spec.

**Type consistency.** `MarketRole` is defined in Task 2 and consumed by Tasks 4, 5, 6, 9 and 10 under that name. `DepthRow` and `RatePoint` are defined in Task 3 and consumed in Tasks 4 and 5. `SpineStage` is defined in Task 6.
