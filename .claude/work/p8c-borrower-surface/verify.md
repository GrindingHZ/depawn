# p8c-borrower-surface verify

## Gates

| Gate | Result |
|---|---|
| `pnpm check` | clean |
| Unit | 172 api, 74 ui, 93 contracts, all passing |
| Integration | 170 across 30 files, all passing |
| Playwright | 32 across 11 projects, all passing |

One integration file failed on the first run with `Timed out while waiting for container ports to
be bound`, which is Testcontainers not starting rather than a fault in the code. It passed on its
own immediately afterwards, so it is recorded here as a flake rather than quietly rerun until green.

## What the slice closed

Every borrower screen now names the item it is about, every state reads as words, and the four
proposals that were still open are done.

- **My receipts** leads with the photograph and the item, with the receipt id kept underneath for
  anyone quoting it to staff.
- **My loans and Funded loans** name the item and explain maturity and grace, each in the language
  of whichever side is reading.
- **Wallet** explains held funds and says in the visible copy that reclaiming is something the
  lender does rather than something that happens to them.
- **My listings and My offers** carry the explanations that belong to them.
- **Browse** filters by category and by loan to value band, and sorts by rate ceiling or by closing
  soonest, all in the database.
- **Money** is formatted by the currency's own minor unit exponent and the reader's own separators.
- **States** read as words everywhere, in one table beside the enums they translate.

## Two things worth reading twice

**The filters had to run in the database.** Filtering a page already fetched hides rows from the
reader while telling them they have seen everything, which is worse than not filtering at all. That
forced the cursor to carry the sort value as well as the id, because rate and closing time both
repeat across listings and a cursor on the id alone would skip or repeat rows at a page boundary.
There is a test that pages through thirty listings which all share one rate and asserts it sees
thirty distinct ids.

**Money was wrong in a way nobody would have noticed until the second market.** It assumed every
currency has two decimal places. The yen has none, so a hundred minor units would have rendered as
one yen instead of a hundred. The exponent now comes from the currency and the separators from the
reader, while the arithmetic stays bigint.

## What was deliberately not done

The vault console and the admin keep their identifiers and their monospace. They are read by trained
staff who speak to each other in receipt ids. Only their state names were put into words, and the
inventory gained the item description beside the id because finding a thing on a shelf is easier
when the screen says what the thing is. Recorded as Q-027 so the asymmetry reads as a decision.

The palette and typography remain frozen. The amendment in docs/13 added motion, easing and
elevation tokens and changed no existing value, so every screen renders as it did before except
where this slice deliberately moved it.
