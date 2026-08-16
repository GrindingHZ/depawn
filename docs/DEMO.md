# Demo runbook

Twelve minutes, three browser windows, one story: an item goes into a vault, a lender funds it, the
borrower repays, and a different borrower does not. Every step below names the screen you should be
looking at and what should be on it. If a step does not match, the demo is broken, not the script.

`e2e/tests/demo.runbook.spec.ts` walks this same path against the same seed, so a change that breaks
the runbook fails the suite rather than surprising you in front of an audience.

## Before anyone is watching

```
pnpm install
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm db:seed` empties the database and rebuilds the whole story through the same endpoints the
apps use, so it is repeatable and so nothing in it could have been reached any other way. It takes
about a minute.

Three apps come up:

| App | Address | Who it is for |
|---|---|---|
| Marketplace | http://localhost:5273 | Borrowers and lenders |
| Vault console | http://localhost:5174 | Vault staff |
| Admin | http://localhost:5175 | Operations |

Open one window per app before you start talking. Sign in ahead of time.

### Accounts

Every account uses the password `demo-password-123`.

| Email | Role | Their part in the story |
|---|---|---|
| `staff@demo.test` | Vault staff | Takes the item in, releases it at the end |
| `ops@demo.test` | Operations | Runs the sale, holds the parameters and the pause switch |
| `ada@demo.test` | Member | Borrower with an item to pledge |
| `gita@demo.test` | Member | Lender with money to put to work |
| `member@demo.test` | Member | An empty account, for showing a first run |

### What the seed leaves behind

- Eight receipts: one already released, four pledged against loans, three still free
- Three live listings, each with two competing offers on it
- Three active loans, maturing in a fortnight, in six weeks, and in three months
- One loan repaid and its item already walked back out of the vault
- One loan defaulted, its sale open, two bids standing against it

The clock is where the seed left it, roughly two months ahead of the wall clock, because a loan
book with history cannot be built at one instant and a clock cannot be asked to run backwards. That
is deliberate and consistent: the offset is written down, the api reads it at startup, and every
date on every screen is measured against the same clock.

`pnpm dev` starts the api in demo mode, which is what puts the clock control on the admin screen.
`pnpm start` does not, and a deployed process has no such route at all.

## The demo

### 1. An item arrives (vault console, 2 minutes)

Sign in as `staff@demo.test`. You are on **Intake**.

1. Start an intake for `ada@demo.test`, category bullion, description "One ounce gold coin".
   The screen shows a draft with an empty evidence list.
2. Record the seal number. The draft now shows it and still refuses to be sealed.
3. Attach a photo. The evidence list has one item.
4. Record an appraisal of AUD 3,000.00. One appraisal is enough below the dual appraisal threshold,
   and the screen says so.
5. Seal the intake, then issue the receipt. You land on a receipt with a status of **IN VAULT**.

Say: we now have custody, an appraisal, and a hash of the record. That receipt is what the borrower
can borrow against, and in Phase 3 it is an object on chain.

### 2. A lender competes for it (marketplace, 3 minutes)

Sign in as `ada@demo.test` in the marketplace window.

1. **My items** shows the receipt you just issued. List it: AUD 1,500.00 requested, a ceiling of
   24.00 percent, thirty days.
2. Publish it. **Browse** now shows it alongside the three the seed left.

Sign in as `gita@demo.test` in a second marketplace window.

3. Open the listing from Browse. Offer the full amount at 18.00 percent for thirty days.
4. Offer again from a third account, or point at one of the seeded listings, which already has two
   offers on it. The offer table ranks by rate, and the lowest rate is on top.

Back as `ada@demo.test`:

5. Accept the top offer. The screen shows the loan: principal, rate, maturity, and the fee taken.
   The item is now **ENCUMBERED** and the balance shows the principal less the origination fee.

Say: one acceptance, one transaction. The hold on the lender's money, the movement to the borrower,
the fee, the loan, and both notes all commit together or not at all. That is why this maps to a
single on chain transaction later.

### 3. Time passes (admin, 1 minute)

Sign in as `ops@demo.test`. Go to **Parameters**.

1. The **Demo clock** card is present because this process was started for a demo. Push the clock
   forward 31 days.
2. Every window is now signed out, because a session lasts seven days and you just skipped a month.
   Sign in again in each. This is worth saying out loud rather than hiding: sessions are measured
   against the same clock as everything else, and the demo is not exempt from its own rules.
3. Return to the marketplace. The loan the borrower just took is now past maturity and the screen
   says so.

Say: nothing here is a mock. The clock is the only thing being lied to, and only in a demo.

### 4. The borrower repays (marketplace, 2 minutes)

As `ada@demo.test`:

1. Open the loan. The payoff quote shows principal, interest accrued to maturity, and the total.
   Interest stopped at maturity, which is why the total does not keep climbing.
2. Repay. The loan reads **REPAID** and the receipt is back to **IN VAULT**.
3. Request redemption of the item.

In the vault console as `staff@demo.test`:

4. **Redemptions** shows the request. Verify it, then confirm release with the broken seal number.
   The receipt reads **RELEASED**.

Say: the item left the building, the receipt is spent, and every movement of money is in the ledger.

### 5. The other borrower does not repay (admin, 3 minutes)

As `ops@demo.test`, go to **Liquidations**. The seed left one sale already taking bids, with two
bids standing.

1. The sale shows the reserve, the highest bid, and the loan behind it.
2. Close the sale. It reads **SETTLED**.
3. Go to **Operations** and search the audit trail for that liquidation id. Every step of the sale
   is there with who did it.

Say: the lender is paid first, the fee comes out of what is left, and the surplus goes back to the
borrower. Not to us. That is the difference between a pawnbroker and a repossession.

### 6. The things that keep it honest (admin, 1 minute)

Still as `ops@demo.test`:

1. **Reconciliation**: run one against the Sydney vault. It compares the physical count to the
   records and the ledger to itself, and reports drift rather than fixing it quietly.
2. **Parameters**: the fees, with a full history of every edit and who made it. An edit writes a new
   version from a date you choose. A loan already originated keeps the terms it was originated
   under, including the fee its liquidation will pay.
3. **Operations**: the pause switch. Pausing stops new listings, offers, acceptances, and sales. It
   never stops a repayment, a redemption, a withdrawal, or the settling of a sale already under way,
   because trapping a borrower's money is not a safety feature.

## If something goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| Every screen is empty | The seed did not run or ran against another database | `pnpm db:seed` |
| Dates look far in the future | Working as intended, see above | Nothing |
| The demo clock card is missing | The api was started without `DEMO_MODE=true` | Restart with the flag |
| An offer is refused as expired | The clock moved past it | Place a new one |
| Every window bounces to login | The clock jumped past the session lifetime | Sign in again |
| A sale refuses to open | The statutory holding period has not passed | Push the clock forward 31 days |

## What not to promise

This is Phase 1. There is no chain, no wallet, and no token. The seams are cut so the money,
custody, identity, and time adapters can be swapped for Sui ones without touching the domain, and
`docs/08-web3-migration.md` is the argument for that, but nothing here has been on chain yet.
