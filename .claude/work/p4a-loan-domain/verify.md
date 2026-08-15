# p4a-loan-domain verify

- pnpm check: exit 0
- pnpm test:unit: exit 0
- pnpm test:integration: exit 0
- pnpm test:e2e: exit 0 (13 tests, unchanged by this slice)

## P4 exit criteria

- Two racing acceptances of different offers on one listing produce exactly one 201 and one
  LISTING_ALREADY_MATCHED, one loan row, and one lender note, over 20 rounds. The listing row lock
  is what serialises them.
- A duplicate acceptance under one idempotency key produces one loan and one ORIGINATE_LOAN ledger
  transaction, whether the replay lands as 201 with the stored body or as 409 while the original is
  still in flight.
- Losing offers end SUPERSEDED with their holds still HELD, and the loser reclaims afterwards to
  recover the full principal.
- Every money moving assertion ends at toSumToZero, and the origination test pins the split: 5000
  minor units to PLATFORM_FEE_REVENUE, 245000 disbursed to the borrower, from a 250000 principal at
  200 basis points.

## Notes carried forward

- Flow 4 step 4, the pause assertion, is deferred to P7 under Q-013.
- Both reviews dispatched to fresh subagents were killed by infrastructure rather than returning a
  verdict, so the review was done in session; review.md records that weakness explicitly.
