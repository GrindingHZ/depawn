# 00: Product overview

## The business

A borrower needs cash and owns something valuable. Instead of selling it, they pledge it. We hold the
item in a secure vault. A lender funds a short-term loan against it. If the borrower repays with
interest, they get the item back. If they do not, the lender takes the item and it is sold.

Traditional pawnbroking is the same business with one lender: the pawnshop's own balance sheet. Our
difference is that **lending is opened to a marketplace**. Many lenders compete to fund each loan,
which pushes rates down for borrowers, and lenders get a short-duration secured yield they could not
otherwise access.

## Actors

| Actor | Description | Surface |
|---|---|---|
| Borrower | Owns the item, wants cash | Marketplace app |
| Lender | Funds loans, earns interest | Marketplace app |
| Appraiser | Values items at intake | Vault console |
| Vault operator | Receives, seals, stores, releases items | Vault console |
| Operations analyst | Reconciles, resolves disputes, monitors exposure | Admin app |
| Compliance officer | Reviews KYC, police reporting, holding periods | Admin app |

Borrower and lender are **the same account type** with no role gate. Any account may do both. Vault
and admin are separate roles on separate applications.

## Glossary

This is the ubiquitous language. These words appear in class names, table names, endpoints, and UI
copy. Do not introduce synonyms.

| Term | Meaning |
|---|---|
| **Item** | The physical object pledged as collateral |
| **Vault** | A physical facility in one city where items are stored |
| **Intake** | The process of receiving, authenticating, appraising, and sealing an item |
| **Intake record** | The immutable evidence bundle produced by intake: photos, serials, seal number, appraisal, staff signatures |
| **Appraisal** | A valuation of an item by a named appraiser at a point in time |
| **Custody receipt** | The transferable claim on a stored item. The only representation of the item the rest of the system ever touches |
| **Listing** | A borrower's public request for a loan against a custody receipt |
| **Offer** | A lender's funded proposal of principal, rate, and duration against a listing |
| **Origination** | The atomic moment a listing and an offer become a loan |
| **Loan** | An active credit position: principal, rate, start, maturity, grace |
| **Lender note** | The transferable right to receive repayment, or the receipt on default |
| **Borrower note** | The transferable right to redeem the receipt by repaying |
| **Accrual** | Interest earned over elapsed time |
| **Redemption** | The borrower collecting the physical item after repayment |
| **Default** | Failure to repay by maturity plus grace |
| **Liquidation** | Sale of a defaulted item and distribution of proceeds |
| **Waterfall** | The order proceeds are distributed: lender, then protocol fees, then borrower surplus |
| **Settlement** | Any movement of value, recorded with a settlement reference |
| **Settlement reference** | The proof a settlement occurred. A ledger transaction id in Phase 1, a chain digest in Phase 3 |

Words we deliberately do **not** use: *escrow* (too vague; say *hold*), *NFT*, *token*, *wallet*
(until Phase 3), *manager*, *handler* as a domain noun.

## Business rules

These are invariants. Every one gets a unit test and, later, an `assert!` in Move.

### Custody

- **C1** A custody receipt is issued only by a vault operator holding intake authority.
- **C2** A custody receipt references exactly one intake record hash and one appraisal.
- **C3** A receipt in `ENCUMBERED` state cannot be listed, transferred by its holder, or released.
- **C4** An item is physically released only against a burned receipt and a verified identity match
  to the intake record.
- **C5** Total appraised value of `IN_VAULT` plus `ENCUMBERED` receipts per vault must not exceed
  that vault's insured limit.

### Marketplace

- **M1** A listing requires a receipt in `IN_VAULT` state held by the listing's borrower.
- **M2** Creating a listing moves the receipt into the listing's control. The borrower cannot
  transfer it while listed.
- **M3** An offer's funds are held at the time the offer is made, not at acceptance.
- **M4** Lenders compete by lowering the interest rate, not by raising the principal.
- **M5** `principal <= appraisedValue * maxLoanToValueBasisPoints / 10_000`. The cap is configured
  per item category and enforced at offer creation *and* again at origination.
- **M6** An offer cannot be withdrawn within `minimumOfferLifetimeMs` of being made.
- **M7** Only the listing's borrower may accept an offer.
- **M8** Accepting an offer does not refund the other offers. Losing lenders reclaim their held funds
  themselves. (Pull, not push. See `docs/10-flows.md`.)

### Loan

- **L1** Interest accrues linearly from `startedAt`, capped at `maturesAt`. No interest accrues after
  maturity.
- **L2** All interest arithmetic is integer arithmetic on minor currency units. No floating point.
- **L3** Repayment must cover principal plus accrued interest in full. No partial repayment in v1.
- **L4** Repayment is credited to the current holder of the lender note, which may not be the
  original lender.
- **L5** A loan may be defaulted only after `maturesAt + graceMs`.
- **L6** A defaulted item may not be liquidated until `statutoryHoldingPeriodMs` has elapsed since
  default.
- **L7** Liquidation proceeds are distributed strictly in waterfall order, and any surplus returns to
  the borrower.

### Money

- **$1** Every value movement is a balanced double-entry ledger transaction. Debits equal credits,
  always, with no exceptions for fees or rounding.
- **$2** No account may go negative except designated liability accounts owned by the platform.
- **$3** All amounts are `bigint` minor units with an explicit currency. Never `number`.
- **$4** Rounding is deterministic and documented per calculation. Rounding remainders go to the
  platform fee account, never silently vanish.

### Safety

- **S1** The system can be paused. Pausing blocks new listings, offers, and originations.
- **S2** Pausing must never block repayment, redemption, offer withdrawal, or default claim. Users
  can always exit.
- **S3** Every write endpoint accepts an idempotency key and is safe to retry.

## Non-goals for the demo

Explicitly out of scope. Do not build these.

- Pooled or tranched lending. Peer-to-peer only.
- Partial repayment or loan extension.
- Real payment rails (Stripe, bank transfer). Phase 1 uses a simulated internal ledger with an
  admin-operated deposit function. See `docs/03-ledger-and-money.md`.
- Real KYC vendor integration. A stubbed provider behind a port.
- Multi-currency. Single currency, but the model carries currency everywhere so it can be added.
- Mobile applications.
- Real insurance integration. The policy reference is a recorded field, not a live check.

## Known risks that shape the design

**We are the oracle.** The chain, later, cannot verify an item exists. Neither can a database. Every
control that makes this credible is procedural: dual appraisal above a threshold, tamper-evident
seals, per-vault exposure caps, third-party audit attestations, and nightly reconciliation between
physical inventory and system state. Build the reconciliation job in Phase 1, not Phase 3.

**This activity is licensed.** Pawnbroking, consumer credit, and possibly securities law all apply,
and the applicable rules differ by jurisdiction. Two consequences for the code: statutory holding
periods and rate caps must be configurable per jurisdiction and enforced in the domain layer, and the
lender note must be non-transferable behind a feature flag that is off by default.

**Custody is the cost centre.** Rent, insurance, security, staff, and appraisal expertise. The
software does not reduce any of it. Keep the operational surface small: one vault, one item category
for the demo.
