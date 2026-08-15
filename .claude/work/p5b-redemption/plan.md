# p5b-redemption plan

Slice base: recorded at plan time. Flow 6 end to end, closing P5.

## Tasks

1. `feat(domain): add the redemption request entity`
   `domain/custody/redemption-request.ts` with REQUESTED to VERIFIED to RELEASED, the exhaustive
   transition table, guard methods returning Result, and a repository port. Fields: id, receiptId,
   requestedByAccountId, vaultId, status, requestedAt, verifiedAt, verifiedByStaffId, releasedAt,
   releasedByStaffId, sealNumberBroken.
2. `test(domain): cover the redemption transitions`
   Every legal move and every illegal one, including release before verify.
3. `feat(db): add the redemption request table`
   Prisma model plus migration; one live request per receipt enforced by a partial unique index,
   because the receipt burn already serialises it but the index survives any future code path.
4. `feat(persistence): add the redemption request repository`
5. `feat(custody): request a redemption and burn the receipt`
   One transaction: assert IN_VAULT and holder is the caller, burn to RELEASED, create the request,
   audit, emit RedemptionRequested. The burn happens at request time because it is the entitlement
   proof; the counter visit is identity verification.
6. `feat(custody): verify and release a redemption`
   Two use cases, two transactions, each writing an audit entry naming the staff member. Release
   asserts VERIFIED, records the seal number broken and the handover time, emits ItemReleased.
7. `feat(api): expose the redemption endpoints`
   `POST /receipts/:id/redemption-requests`, `GET /redemption-requests?vaultId=&status=`,
   `POST /redemption-requests/:id/verify`, `POST /redemption-requests/:id/release`. New error code
   REDEMPTION_NOT_VERIFIED for the 409 the flow 6 failure table names without naming a code.
8. `test(api): prove the burn happens at request time`
   Integration: request burns the receipt, a second request is refused, an encumbered receipt is
   refused with RECEIPT_ENCUMBERED, release before verify is refused, the full path ends RELEASED,
   and vault exposure falls by the appraised value once the receipt burns.
9. `test(api): race two release confirmations`
   Twenty rounds: one handover, one audit entry, one RELEASED request.
10. `feat(vault-console): add the releases queue`
    `/releases` listing REQUESTED and VERIFIED work for the vault, and `/releases/:requestId` with
    the two step verify then release, each step stating plainly what becomes irreversible.
11. `feat(marketplace): show redemption status on receipts`
    The receipts screen gains a request action for a free receipt and the status of any request.
12. `test(e2e): redeem an item across both apps`
    Playwright: borrower requests, console verifies then releases, borrower sees RELEASED.
13. Review by a fresh subagent, fixes as new commits, then the four gates and close P5.

## Notes

- Exposure is derived, not stored, so flow 6 step 4 needs no decrement; task 8 asserts the fall
  rather than adding a counter that could disagree with the sum.
- Identity verification in Phase 1 records who asserted it. `IdentityPort.verifyControl` is Phase 3.
- A claimed receipt after a default is redeemed through this same flow by its new holder, which is
  why the guard is holder based rather than borrower based.
