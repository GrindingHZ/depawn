# depawn

**A pawn shop with a public order book.**

You have a gold bar and a cash flow problem. You do not want to sell it, and you do not want to
explain yourself to a bank. So you walk into a vault, hand it over, and walk out with a receipt.
That receipt goes on a marketplace where lenders bid against each other for the right to lend you
money. You take the cheapest offer. Thirty days later you repay and collect your gold, or you do
not, and it is sold with the surplus coming back to you.

That is the whole product. It is a pawnbroker running a loan book on modern rails, built so that
the money, the custody, and the clock can be moved onto a blockchain later without the business
rules noticing.

```
docker compose up --build
```

Three apps, one database, seeded with a full story. Nothing else to install.

| | Address | Sign in as |
|---|---|---|
| **Marketplace** | http://localhost:5273 | `ada@demo.test` borrows, `gita@demo.test` lends |
| **Vault console** | http://localhost:5174 | `staff@demo.test` |
| **Admin** | http://localhost:5175 | `ops@demo.test` |

Password for everyone: `demo-password-123`

---

## What is actually in here

### The marketplace, for borrowers and lenders

The same person can be both. There is no borrower role and no lender role in the system, only your
relationship to a particular listing.

- **Browse** every live listing, filtered by category and by how much of the item's value is being
  borrowed against, sorted by rate ceiling or by whichever closes soonest. Filtering happens in the
  database, not over a page already fetched.
- **A listing** shows the photograph the vault took, the appraisal, the loan to value, and an offer
  book ranked cheapest first, with the interest and the total repayable spelled out separately so
  nobody confuses one for the other.
- **Place an offer** and your money is held, not spent. Lose the auction and you reclaim it
  yourself. Nothing moves your money without you asking.
- **My receipts, listings, loans, offers, funded loans, wallet.** Every screen names the item it is
  about rather than the database key.
- **Little `i` buttons** next to anything a person might not know. Each one says what the term
  means and then what it means *for you*, and it says something different depending on whether you
  are the borrower or the lender. Grace period is protection to one and a delay to the other.

### The vault console, for staff

A five step intake wizard: identify, photograph, appraise, seal, issue. It refuses to seal without
evidence, demands a second independent appraisal above a threshold, and will not take an item that
would push the vault past its insured limit. Plus inventory, the release queue for people
collecting their property, and current exposure.

### The admin, for operations

Deposits, the loan book, liquidations, reconciliation, protocol parameters with full edit history,
a pause switch, request metrics, and the dead letter queue.

The pause switch is the interesting one. It stops new listings, offers, acceptances and sales. It
never stops a repayment, a redemption, a withdrawal, or the settling of a sale already under way,
because trapping a borrower's money is not a safety feature.

### Underneath

- **64 endpoints.** Every write that moves money is idempotent, behind a key claimed before the
  handler runs, so a double click replays the answer instead of paying twice. Every state change is
  audited with who did it.
- **A double entry ledger** where balances are derived and never stored, and every transaction is
  proved balanced three separate ways: a domain assertion, a Postgres trigger, and property tests.
- **Money as bigint minor units.** No floats anywhere near an amount. Division truncates in the
  borrower's favour on purpose.
- **Five item categories priced by liquidity.** We lend against 60 percent of a gold bar and 30
  percent of a painting, because one of them sells the same day.
- **A demo clock** you can push forward from the admin screen, so a loan can reach maturity in front
  of an audience.

---

## Running it

### The demo

```bash
docker compose up --build
```

First build takes a few minutes, then seconds. It migrates the database, seeds it if it is empty,
and serves everything. Restarting keeps your data. To start the story over:

```bash
docker compose down -v && docker compose up
```

`docs/DEMO.md` is a twelve minute script with the exact click path if you want to be walked through
it.

### Working on it

```bash
pnpm install
pnpm db:up          # postgres only
pnpm db:migrate
pnpm db:seed        # the whole story, through the real endpoints
pnpm dev            # api plus all three apps, hot reload
```

Same addresses either way.

### Checking it

```bash
pnpm check          # types, lint, format, architecture boundaries, prose, design tokens
pnpm test           # unit and integration
pnpm test:e2e       # playwright across all three apps
```

Roughly 340 unit tests, 170 integration tests against a real Postgres in a container, and 32
Playwright tests including an accessibility pass and a walk through the demo runbook itself.

One thing to know: `pnpm test:e2e` refuses to run while the demo is up, because a demo process
runs its clock two months ahead and every deadline the suite writes would land in that clock's past.
Stop it first.

---

## How it is put together

```
apps/api              NestJS. Domain, use cases, ports, adapters, HTTP.
apps/marketplace      Borrowers and lenders.
apps/vault-console    Vault staff.
apps/admin            Operations.
packages/contracts    Request and response types, shared by all four.
packages/ui           Components and the frozen design tokens.
docs/                 Fourteen normative documents, written before the code.
```

The rule everything else follows: **the domain layer must be identical in Web2 and Web3.** Money,
custody, identity and time reach the domain only through ports, of which there are fourteen. Today
a Postgres adapter is behind them. Later a Sui adapter will be. Nothing in `apps/api/src/domain/`
changes, and a build check fails if a domain file so much as imports from infrastructure.

**Stack:** TypeScript, NestJS, PostgreSQL, Prisma, React, TanStack Router and Query, Tailwind,
Vitest, Testcontainers, Playwright, Docker.

---

## Reading further

| | |
|---|---|
| `DOCUMENTATION.md` | Two pages on the approach, the decisions, and the flowcharts |
| `docs/DEMO.md` | The runbook: what to click and what to say |
| `docs/00-product-overview.md` | Domain, actors, glossary, business rules |
| `docs/10-flows.md` | Every flow end to end, with failure modes |
| `docs/OPEN-QUESTIONS.md` | 28 things that were ambiguous, and what was implemented instead of guessing |

## What this is not

There is no chain, no wallet and no token yet. The seams are cut so the adapters can be swapped, and
`docs/08-web3-migration.md` is the argument for why that will work, but nothing here has been on
chain. The outbox is honestly at least once rather than exactly once. It is one vault, one currency,
and one jurisdiction.
