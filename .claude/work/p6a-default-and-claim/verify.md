# p6a-default-and-claim verify

- pnpm check: exit 0
- pnpm test:unit: exit 0
- pnpm test:integration: exit 0
- pnpm test:e2e: exit 0 (17 tests, one new), four consecutive clean runs

## Flow 7 exit criteria

- A default is refused during grace and on the last millisecond of it, and allowed one millisecond
  later. The boundary is pinned with real Instant arithmetic in the domain and through HTTP in the
  integration suite, where the rejection also carries the deadline so a lender is told until when.
- Only the current lender note holder can default or claim, resolved inside the locked transaction.
  A borrower attempting either gets 403.
- The instant of default is recorded, and the entity now refuses to exist with the two out of step:
  defaultedAt is set exactly when the loan has defaulted, which holds through LIQUIDATED because a
  liquidated loan defaulted first. Flow 8 reads that instant for the statutory holding period.
- A claim before the default is refused as LOAN_NOT_DEFAULTED, and a claim on a loan the borrower
  repaid in time is refused as LOAN_NOT_ACTIVE, which is what flow 7 names.
- Flow 7 step 3 joins up with flow 6: the integration test carries a lender from default through the
  claim into a redemption request, which only works because the claimed receipt lands IN_VAULT under
  its new holder. That is concrete evidence for the reading recorded in Q-012.
- Twenty rounds each of racing defaults and racing claims: one DEFAULTED loan, one LoanDefaulted
  event, one receipt movement, one ReceiptClaimedByLender event. No money moves in flow 7, so the
  ledger assertions are that nothing changed.
- The Playwright journey proves the gate through the interface: a click inside grace returns the
  server's refusal with a readable reason, and the same click 38 days later defaults the loan and
  claims the item into the lender's own receipts.

## Notes carried forward

- Q-018: LOAN_NOT_DEFAULTED is a code this slice added, because flow 7 names none for claiming
  against a healthy loan.
- The claim locks the loan but not the receipt. Sound today because every write path to an
  encumbered receipt takes the loan lock first, and proven by the race test, but p6b adds another
  write path to the same receipt and should either take the same lock or say why it need not.
- Whether grace has passed is decided by the server. The client shows the deadline and lets the
  rejection carry the boundary, rather than gating on a browser clock that may disagree.
