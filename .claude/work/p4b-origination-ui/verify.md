# p4b-origination-ui verify

- pnpm check: exit 0
- pnpm test:unit: exit 0
- pnpm test:integration: exit 0
- pnpm test:e2e: exit 0 (14 tests, one new)

## P4 exit criteria, both halves

The backend proofs live in p4a: one loan from two racing acceptances, one loan from a duplicate
request, losing offers SUPERSEDED with their holds intact, and a balanced ledger. This slice closes
the user facing half of the phase.

The Playwright journey drives the whole origination path through the interface: the borrower lists
the receipt, two lenders fund offers at different rates, the borrower opens their own listing and
sees the book ranked cheapest first with no offer form of their own, the winning lender sees no
Accept control at all, acceptance lands the borrower on an ACTIVE loan at the accepted rate, the
winning lender sees the same loan under funded loans, and the losing lender still sees the reclaim
banner with the full principal held until they pull it back.

## Notes carried forward

- Q-014: the brief does not name a tone for an active loan past the end of grace that nobody has
  marked defaulted; it reads PAST MATURITY in warning today.
- The loan screens state plainly that repayment, default, and claim actions arrive in later
  releases rather than showing controls that do nothing.
