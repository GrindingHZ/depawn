# p4a-loan-domain plan

Slice base: commit at plan time. Backend origination per docs/10 flow 4; UI follows in p4b.

## Tasks

1. `feat(domain): add loan entity with lender and borrower notes`
   `domain/lending/loan.ts` with `allowedLoanTransitions` (ACTIVE to REPAID or DEFAULTED,
   DEFAULTED to LIQUIDATED), an `originate` factory deriving `maturesAt` and `graceEndsAt`,
   and thin `lender-note.ts` and `borrower-note.ts` records with `transferable` from the
   `notesTransferable` parameter. `loan-repository.ts` port with save and find methods.
2. `test(domain): cover loan origination derivation and transitions`
   Maturity and grace arithmetic in bigint, status table walked, notes minted unattached to
   any lender account id on the loan itself.
3. `feat(db): add loan and note tables`
   Prisma models loan, lender_note, borrower_note; migration; loan.version for optimistic
   locking; unique loan per receipt among live loans is not enforced here because the
   receipt encumbrance already serialises it.
4. `feat(persistence): add prisma loan repository and mappers`
5. `test(persistence): round trip loans and notes through postgres`
6. `feat(lending): add accept offer use case`
   modules/lending/application/accept-offer.use-case.ts: one unitOfWork.run; listing lock,
   aggregate acceptOffer, LTV re-check against the receipt, releaseHold(winning hold,
   [borrower disbursement, fee revenue originationFee]), encumberReceipt, Loan.originate,
   save loan and notes and listing, audit, LoanOriginated event. Reuses holdOf from
   withdraw-offer.
7. `feat(api): expose acceptance and loan reads`
   POST /listings/:listingId/offers/:offerId/accept (borrower, idempotency interceptor),
   GET /me/loans?role=, GET /loans/:id via a LoanQueries port plus prisma adapter; contracts
   schemas LoanResponse and clients; error mapping for LISTING_ALREADY_MATCHED,
   OFFER_NOT_PENDING, OFFER_EXPIRED, LOAN_TO_VALUE_EXCEEDED, LISTING_NOT_FOUND.
8. `test(api): prove origination settles balanced and encumbers`
   Happy path integration: 201, ledger zero, fee on PLATFORM_FEE_REVENUE, disbursement on
   borrower available, receipt ENCUMBERED, losers SUPERSEDED, holds intact, loser reclaim
   still works after matching.
9. `test(api): race two acceptances and replay one`
   20 round race: two parallel accepts of different offers on one listing, exactly one 201
   and one 409 LISTING_ALREADY_MATCHED, one loan row, ledger zero. Idempotent replay of the
   same accept: one loan, identical body.
10. Review by fresh subagent, fixes as new commits, then verify gates
    (`pnpm check`, unit, integration, e2e) and close.

## Notes

- The pause assertion of flow 4 step 4 is deferred to P7 (Q-013).
- The accept response returns the created loan so p4b needs no follow-up fetch.
