# p4b-origination-ui brainstorm

## Goal

Close P4 by putting origination in front of both sides: the borrower accepts an offer from the
listing they own, and both parties see the resulting loan.

## What already exists

- `POST /listings/:id/offers/:offerId/accept` returning the LoanResponse, `GET /me/loans?role=`,
  and `GET /loans/:id` from p4a, with clients in `packages/contracts/src/client/lending-client.ts`.
- Listing detail already renders the ranked offer book and a place offer card gated on ACTIVE.
- MarketShell carries the nav and the persistent reclaim banner.

## Screens

1. Listing detail (`routes/listings.$listingId.tsx`): when the viewer is the listing borrower and
   the listing is ACTIVE, the offer book grows an Accept action per PENDING row and the place offer
   card is hidden, because a borrower cannot fund their own listing. Accepting invalidates the
   detail, my listings, my loans, and the wallet keys, then routes to `/borrow/loans`.
2. `routes/borrow.loans.tsx`: loans where the account is the borrower. Principal, rate, started,
   matures, grace ends, status. Repayment actions arrive with P5, so the screen states plainly that
   repayment opens in the next slice rather than showing a dead button.
3. `routes/lend.loans.tsx`: loans funded by the account, resolved through the lender note holder.
   Default and claim actions arrive with P6.
4. Nav gains My loans (borrower) and Funded loans (lender) entries.

## Decisions

- The accept confirmation states the disbursement and the origination fee before the click, derived
  from the ranked offer and the fee parameter. The fee parameter is not currently exposed to the
  client, so the narrowest reading shows principal and total borrower cost only, and the exact
  disbursement appears on the loan screen after acceptance. Recorded as Q-014 if the fee is wanted
  before the click.
- No new endpoint: the accept response is the loan, so the UI shows it without a follow-up fetch.

## Tests

- Component specs for the accept action visibility rule (borrower sees it, lender does not).
- Playwright: borrower lists, lender offers, borrower accepts, borrower sees an ACTIVE loan, lender
  sees the same loan under funded loans, loser reclaim banner still visible for a second lender.
