# The Vault Floor: marketplace workspace redesign

Status: approved in brainstorming, not yet planned
Phase: P0.6 (design system amendment) plus P8d (marketplace workspace)
Supersedes: nothing. Amends `docs/13-design-system.md` and `docs/DESIGN-BRIEF.md`.

## Why

The marketplace renders a public order book as a plain list. A borrower cannot see where their
item sits in the lifecycle without visiting four screens, and a lender cannot compare an offer
book against the collateral it is secured by without losing their place. The request was for
something that reads like a stock market and makes the relationship between one thing and the
next legible.

A trading terminal was considered and rejected as the whole answer. Three reasons, recorded
here because they should survive the person who made them:

1. **The instrument is a unique physical object.** A ticker abstracts away the photograph, the
   appraisal, the seal and the liquidity note, which are the information a lending decision
   actually runs on. Abstracting them is not compression, it is loss.
2. **The data is thin.** A handful of live listings with three to ten offers each, moving over
   hours. Four dense panes over that renders as empty chrome.
3. **It over-promises.** Terminal chrome implies liquidity and instant exit. A pawn loan is a
   thirty day illiquid commitment against an item in a warehouse.

The market metaphor is kept exactly where the product is a market: the offer book, where rule
M4 already specifies that lenders compete by lowering the rate.

## Decisions

| Decision | Choice | Consequence |
|---|---|---|
| Information architecture | One persistent workspace, three linked surfaces | Replaces page per screen routing in the marketplace |
| Layout | Two pane, collateral forward, with a rows to gallery density toggle | Photograph and appraisal lead the decision |
| Surfaces affected | Marketplace goes dark. Vault console and admin stay light, adopt the new component layer and density | Reopens Q-027 |
| Liveness | Read only market query endpoints, polled | No domain change, no new ports |
| Listing identity | The item description, styled as an instrument | No new glossary vocabulary |
| Role detection | Derived from the caller's relationship to the listing | No toggle to leave in the wrong position |

## The rule that governs the layout

There is exactly one selected listing. It lives in the URL as a TanStack Router search param.
Every pane reads it. No pane owns state that another pane has to be told about.

```
?listing=01JQF...&tab=book&density=rows
```

This buys the back button, refresh restoration and shareable links without any pane knowing
that the others exist. It also keeps each pane independently testable: give it a listing id,
assert what it renders.

One deliberate exception: clicking a row in the offer book highlights that offer's point on the
rate history chart rather than navigating. Selecting an offer is not selecting a listing.

## Surfaces

### Browse (left pane)

Collateral first. Each row carries the photograph, the item description, appraised value, asking
principal, loan to value, the current best rate and the custody assurances (sealed, insured,
dual appraised). Filters by category, loan to value band and rate ceiling; sorts by rate, loan
to value or time remaining. Filtering and sorting happen in the database, which is already true
today and must stay true.

A density toggle switches between rows and a gallery of larger photographs. The gallery is for
hunting, the rows are for comparing.

### Detail and offer book (right pane)

Header names the item and its vault. Below it, split: rate history on the left, offer book on
the right.

**Rate history** is a stepped line, not a smooth curve. Offers arrive at discrete moments, and
interpolating between them would draw data that does not exist.

**Offer book** is a depth ladder: rate ascending, amount, cumulative amount, total cost to the
borrower. The best offer is distinguished by weight and by a leading marker, never by colour
alone. Cumulative depth renders as a background bar behind the rate column.

### Lifecycle spine (bottom strip)

The answer to "where is my item in all this". Role aware:

- Borrower: Receipt, Listed, Funded, Maturing, Redeemed
- Lender: Offered, Competing, Funded, Default risk, Settled

Each node is clickable and filters the browse pane to the listings at that stage. The spine is
what a stock terminal has no equivalent of, and it is the part that answers the original request
most directly.

### Index strip and tape

A category rate index across the top and a cross listing activity tape along the bottom. Both
are polled. Both are new read models.

## Colour bound to role, not to arithmetic

The single most important visual rule in this design.

A rate of 11.2 percent falling by 0.8 is good news for the borrower and bad news for the lender.
The arrow comes from arithmetic. The colour comes from who is looking. A stock terminal paints
falling red for everyone and would tell half the users the opposite of the truth about their own
money.

Three new tokens, deliberately separate from the status tokens they currently share a hue with:

```
--color-market-favourable   moved in your favour
--color-market-adverse      moved against you
--color-market-flat         unchanged
```

A repaid loan being successful and a rate moving in your favour are different ideas. Fusing them
means neither can change without the other.

This extends a principle the codebase already holds. `Explain` says something different to each
side of the same loan. This carries that into colour and into the spine's vocabulary.

## The design system amendment

`docs/13-design-system.md` currently states that `[data-surface='terminal']` may override density
only, and that "the palette never forks". This design forks it. That is a real change to a
written rule and is recorded as such rather than slipped through.

**Naming.** `terminal` is already taken by the vault console. The marketplace scope is
`[data-surface='floor']`.

**What the amendment permits.** The palette may fork into exactly one additional named scope,
which must carry its own complete recorded contrast table. It may not fork a second time without
another amendment. Light values under `:root` do not change, so the vault console and admin
render identically to before.

### The floor palette

| Token | Value | Ratio on base | Verdict |
|---|---|---|---|
| `--color-surface-base` | `#0B0F14` | ground | |
| `--color-surface-raised` | `#131A22` | panes, rows, inputs | |
| `--color-surface-sunken` | `#080B0F` | headers, wells | |
| `--color-text-primary` | `#E6EDF3` | 16.27:1 | AA pass |
| `--color-text-secondary` | `#8B9AAB` | 6.69:1 | AA pass |
| `--color-border` | `#1E2A36` | 1.32:1 | decorative hairlines only |
| `--color-border-strong` | `#5A6D82` | 3.61:1 | meets 1.4.11 for control bounds |
| `--color-accent-default` | `#2EA043` | 5.70:1 | AA pass |
| `--color-accent-hover` | `#3FB950` | 7.57:1 | AA pass |
| `--color-status-active` | `#2F81F7` | 5.13:1 | AA pass |
| `--color-status-warning` | `#D29922` | 7.61:1 | AA pass |
| `--color-status-danger` | `#F85149` | 5.73:1 | AA pass |
| `--color-status-neutral` | `#8B9AAB` | 6.69:1 | AA pass |

Worst case on `surface-raised` rather than `surface-base`: text-secondary 6.10:1,
status-active 4.68:1, border-strong 3.29:1. All pass.

`--color-border-strong` is new to the whole system, not only to the floor scope. Today a single
`--color-border` serves both a table hairline that should disappear and the outline of an input
a person has to find. Those are different jobs at different contrast requirements. The light
scope gains the token too, so the two scopes stay structurally identical.

### Density

`--density-row-floor: 2.25rem` (36px). The existing type scale is unchanged, with one extension:
`text-xs` is currently reserved for status badges, and the floor scope also permits it for
tabular numeric data. Numerals use `font-variant-numeric: tabular-nums` so columns align.

## Backend

Two read only query services, following the read model split in `docs/01-architecture.md`
(dedicated query services returning flat DTOs, never hydrated aggregates).

```
GET /market/index?category=&window=    average rate over time, per category
GET /market/tape?limit=                recent offers and originations, cross listing
```

No domain change. No new ports. No writes. The Web2 to Web3 seam is untouched, which is the
point of putting them here rather than in a use case.

Derived client side from data the API already returns, with no new endpoint:

- rate history, from `offers[].createdAt` and `annualPercentageRateBasisPoints`
- depth ladder, from offers sorted by rate with a running cumulative
- total cost, from `totalCostToBorrower`, which ranked offers already carry

## Components

| Component | Source | Note |
|---|---|---|
| `OfferBook` | new | Depth ladder. Nothing off the shelf models this. |
| `RateHistory` | new, hand rolled SVG | Stepped line. Recharts was specified here and dropped during implementation: the series is under twenty points, and a charting dependency arrives with its own theming layer to reconcile against the tokens and reopens the Tailwind v4 question for no gain. |
| `LifecycleSpine` | new | Role aware stage rail. |
| `MarketDelta` | new | Binds direction and colour to role. |
| `Tape` | new | Cross listing activity strip. |
| `IndexStrip` | new | Category rate index. |
| `WorkspacePanes` | shadcn resizable | Radix backed, keyboard resizable. |
| `CollateralRow` / `CollateralCard` | new | The rows to gallery toggle. |
| `DataGrid` | shadcn table | Sticky headers, sortable, 36px rows. |
| `JumpToListing` | shadcn command | Keyboard switcher. |
| `TickingNumber` | VengeanceUI `animated-number` | Count up on rate change. |
| `Money`, `Rate`, `LoanToValue`, `Explain`, `StatusBadge`, `ItemPhotograph` | reuse unchanged | Already correct. |

### Vendoring rules

VengeanceUI publishes through the shadcn CLI registry, so components arrive as source we own.
They are not an npm dependency and cannot be one.

- Every vendored component is ported into `packages/ui/src/` with token classes replacing every
  raw colour, before it is used anywhere. `scripts/check-design-tokens.sh` keeps its teeth; no
  exemption is added for vendored code.
- Stay on Tailwind 3.4. Upstream targets v4. A v4 migration in the same slice would make every
  visual regression ambiguous between the palette and the engine.
- `next/image` and `next/link` imports are replaced at port time.
- Of VengeanceUI's 74 registry components, one is taken. The value of the library here is the
  shadcn and Radix layer underneath it.

## Error and empty states

The workspace has more ways to be empty than a page does, and each pane must say something
useful rather than collapsing.

| Condition | Behaviour |
|---|---|
| No listing selected | Detail pane shows a prompt, not a spinner. Browse and index still render. |
| Selected listing not found or expired | Detail pane says so and offers to clear the selection. Browse stays usable. |
| Selected listing not visible to caller | Same response as not found, so the pane cannot be used to discover which listings exist. |
| Offer book empty | States that no lender has offered yet, with the asking rate as context. |
| Index or tape query fails | The strip degrades to absent. Neither is load bearing for any action. |
| System paused | Place offer and accept are disabled with the reason. Repay, redeem, withdraw and reclaim stay live, per rule S2. |

Error codes continue to map through the existing `error-copy` table. No error is asserted on by
message text.

## Testing

Follows `docs/06-testing.md`. The slice is not done without all of it.

- Unit tests for every new component in `packages/ui`, including a `MarketDelta` test that
  asserts the same delta renders favourable for the borrower and adverse for the lender.
- Unit tests for the derivation functions (depth accumulation, rate history stepping) as pure
  functions, separate from any component.
- Integration tests against real Postgres via Testcontainers for both new query endpoints,
  including the authorisation case where a listing is not visible to the caller.
- Playwright: selection propagation (choose in browse, assert detail, book and spine all follow),
  URL restoration (reload, assert the same view), and the role split (same listing signed in as
  borrower then as lender, assert opposite colour tokens).
- Accessibility: axe against the workspace, pointed at a route that exists. The P8a review found
  an audit scanning an empty page and reporting green, and that must not recur.
- Contrast: an automated check asserting the recorded ratio table, so the numbers in
  `DESIGN-BRIEF.md` cannot drift from the tokens.

## Documentation to update

- `docs/13-design-system.md`: the fork amendment, its conditions, and the `floor` scope name.
- `docs/DESIGN-BRIEF.md`: the second palette and its contrast table.
- `docs/05-frontend.md`: the workspace replaces page per screen routing in the marketplace.
- `docs/10-flows.md`: flows 2, 3 and 4 change surface, though not a single step.
- `docs/OPEN-QUESTIONS.md`: Q-027 becomes a decision that was revisited, with the reason.

## Risks

**The palette change is the irreversible part.** Everything else can be adjusted in place. Fold
the contrast check in early rather than at the accessibility gate.

**Two E2E suites will move.** `accessibility.spec.ts` and `demo.runbook.spec.ts` both assert
against marketplace screens that change shape. `docs/DEMO.md` step 2 describes a click path that
will no longer exist.

**Thin data is still thin.** The workspace must look deliberate with three listings, not only
with thirty. Empty states are part of the design, not a later pass. The seed should be checked
against the new layout before the layout is called done.

**Scope creep toward the ops consoles.** Modernising the vault console and admin means the new
component layer and the density, not the dark palette and not the workspace. Their information
architecture does not change.

## Out of scope

- Server sent events or any push transport. Polling only. Revisit if the tape feels stale.
- Tailwind v4.
- Any change to the domain layer, ports, or write use cases.
- The workspace on mobile. The marketplace stays responsive down to a single column, but a four
  pane workspace is a desktop instrument and is not being reimagined for a phone.
