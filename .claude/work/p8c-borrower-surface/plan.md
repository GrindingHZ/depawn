# p8c-borrower-surface plan

p8b proved the pattern on two screens. This applies it everywhere it earns its place, and closes
the three proposals that were never started.

## What is actually left

- **My receipts** leads with a ULID and shows no photograph, which is perverse: it is the reader's
  own item and the one place a picture is certainly theirs to see.
- **My loans, My offers, Funded loans, My listings** are identifier first tables with no explain
  layer. A borrower reads a grace deadline with nothing telling them what grace is.
- **Wallet** shows held funds with no explanation of why money is held or how it comes back, which
  is the most confusing thing in the product.
- **Motion** has no tokens and no rule.
- **Scale**: Browse renders every live listing unpaginated, with no search, sort or filter, and the
  cursor the api already returns is ignored.
- Six glossary terms are written and wired nowhere.

## Decisions

**Option A on the freeze, as recommended and not yet contradicted.** Motion, elevation and a wider
spacing ramp are added to `tokens.css` as new semantic tokens through a deliberate amendment to
`docs/13-design-system.md`. No existing value changes, so no screen shifts and the palette and
typography stay frozen exactly as the rule intends.

**The vault console and the admin keep their identifiers.** They are read by trained staff who
speak to each other in receipt ids, and a table that leads with the id is the right tool for that
job. They get the item description added where it helps a person find a thing on a shelf, and
nothing else. Applying a lender facing treatment to an operations console would be cargo culting
the pattern rather than using it.

## Tasks

1. `feat(contracts): carry the item on receipts and loans`: itemDescription and hasPhotograph on
   the receipt response, itemDescription on the loan response, so every borrower screen can show
   what a row is about.
2. `feat(ui): add motion and elevation tokens`: three durations, two easings, a small elevation
   scale, all honouring reduced motion. Amend docs/13 in the same commit, because the rule is the
   reason the tokens are allowed.
3. `feat(marketplace-ui): show the item on the borrower screens`: My receipts, My listings, My
   loans, My offers, Funded loans.
4. `feat(marketplace-ui): explain the wallet`: held funds, and what reclaiming does.
5. `feat(marketplace-ui): search and sort the marketplace`: filter by category and loan to value
   band, sort by rate or by closing soonest, and follow the cursor the api already returns.
6. `feat(ui): format money by its own currency`: `Intl.NumberFormat` driven by the money's
   currency rather than a hardcoded AUD symbol.
7. `feat(vault-console): name the item in the inventory`: description beside the id, for finding a
   thing on a shelf.
8. Tests at every level, and the e2e specs updated where markup moved.

## Risks

- Several e2e specs assert on table text that is about to become cards. Each one has to be
  re-pointed at what it actually means to check, not weakened.
- `Money` is used on every screen. Changing its formatter touches all of them, so its own tests
  have to pin the output for more than one currency before anything else moves.
