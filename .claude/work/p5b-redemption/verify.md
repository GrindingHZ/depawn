# p5b-redemption verify

- pnpm check: exit 0
- pnpm test:unit: exit 0
- pnpm test:integration: exit 0
- pnpm test:e2e: exit 0 (16 tests, one new)

## Flow 6 exit criteria

- The receipt burns at request time, in the same transaction that opens the request, and the item
  leaves the derived vault exposure with it. The integration test watches exposure fall from 500000
  to zero on the request alone, which is what flow 6 step 4 asks for without a second counter that
  could disagree with the sum.
- A second request on a burned receipt is refused, as is a request against collateral on a live
  loan and a request from anyone but the current holder. Holder based rather than borrower based,
  so a lender who claims collateral after a default redeems through this same flow.
- Handover before verification is refused, and the two counter steps stay separate events with
  their own audit entries naming the staff member, so a dispute can tell which one failed. The
  integration test walks the audit trail and pins its three entries in order.
- Twenty rounds of two concurrent release confirmations produce one handover, one audit entry, and
  the winning seal number on the record rather than the last writer's.
- The queue is vault staff only; a member is refused.
- The Playwright journey crosses both apps: the borrower asks for the item back and sees the
  receipt spent immediately, staff find the request in the queue, verification gates the handover,
  and the borrower sees RELEASED afterwards.

## Notes carried forward

- Q-017: redemption status lives on the receipts screen rather than a route of its own.
- The vault is a shared mutable fixture across Playwright projects. Redeeming is the only thing in
  the suite that lowers exposure, so it runs in its own project after the base three, and the
  intake spec's exposure claim is a lower bound with the exact arithmetic proven in isolation by
  the integration suites.
- P5 is complete: loans accrue, get quoted, get repaid, and items go home.
