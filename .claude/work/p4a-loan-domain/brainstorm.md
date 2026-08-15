# p4a-loan-domain brainstorm

## Goal

Flow 4 origination end to end on the backend: accepting an offer turns a listing into a loan in
one transaction. UI lands in p4b so this slice can over-test the transaction itself.

## What already exists

- `Listing.acceptOffer` (p3a) validates ACTIVE, offer PENDING and unexpired, borrower ownership,
  and returns `AcceptedOffer` with `originationFee`, `disbursement`, and `supersededOfferIds`.
- `SettlementPort.releaseHold(hold, distribution)` writes one balanced ledger transaction; the
  ORIGINATE_LOAN kind and the PLATFORM_FEE_REVENUE sentinel are live since p1a.
- `CustodyPort.encumberReceipt(receiptId, loanId)` exists with a contract test.
- LTV policy, protocol parameters token, idempotency interceptor, audit port, event publisher.

## What this slice adds

1. `domain/lending/loan.ts`: Loan entity per docs/02 (fields incl `lenderNoteId`,
   `borrowerNoteId`, `originationSettlementRef`, `version`), exported transition table
   ACTIVE to REPAID or DEFAULTED, DEFAULTED to LIQUIDATED. P4 needs only creation and the
   table; `calculateAmountDue` and the repayment and default guards arrive with P5 and P6,
   which own the interest calculator and the grace gate. Notes are thin records with
   `transferable` false behind `notesTransferable`.
2. `LoanRepository` port in the domain, Prisma schema (loan, lender_note, borrower_note) and
   migration, Prisma adapter.
3. `AcceptOfferUseCase`: one `unitOfWork.run`; lock listing FOR UPDATE, aggregate accept,
   re-check LTV against the receipt appraisal, releaseHold into borrower disbursement plus
   platform fee, encumber, create loan and mint notes, persist offer and listing states,
   audit, emit LoanOriginated. Losers stay SUPERSEDED with holds intact (pull not push).
4. HTTP: `POST /listings/:id/offers/:offerId/accept` (borrower, idempotent), plus the read
   side p4b needs: `GET /me/loans?role=` and `GET /loans/:id` via a LoanQueries port.
5. Contracts: LoanResponse and accept schemas, error codes LISTING_ALREADY_MATCHED (exists),
   OFFER_NOT_PENDING (exists), LOAN_TO_VALUE_EXCEEDED (exists).

## Decisions

- Flow 4 step 4 asserts the system is not paused. Pause arrives in P7; there is no pause state
  to read yet. Narrowest reading: omit the check now, P7 adds it with the never-block-exit
  tests. Recorded as Q-013 in docs/OPEN-QUESTIONS.md.
- Loan does not store the lender account id, only `lenderNoteId`; who is owed is derived by
  joining the note (docs/02). The loan queries port does that join.
- Releasing the winning hold reuses the exactly-once funds_hold status machinery from p1a, so
  a race between two accept calls on different offers of one listing is decided by the listing
  row lock, and a duplicate accept of the same offer replays through idempotency.

## Exit tests (docs/07 P4)

- Race: two concurrent acceptances, one 201, one 409 LISTING_ALREADY_MATCHED, exactly one loan.
- Idempotency: duplicate accept request produces one loan and the original body.
- Losers end SUPERSEDED with holds intact and still reclaimable afterwards.
- Ledger sums to zero; fee lands on PLATFORM_FEE_REVENUE; disbursement on borrower available.
