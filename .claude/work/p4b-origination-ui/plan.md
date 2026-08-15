# p4b-origination-ui plan

Slice base: recorded at plan time. Closes P4 by exposing origination in the marketplace app.

## Tasks

1. `feat(marketplace): accept an offer from the listing detail`
   Offer book gains an Accept column when the viewer owns the listing and the row is PENDING;
   the place offer card hides for the borrower. Mount generated idempotency key rotated on
   success, invalidations across detail, my listings, my loans, and wallet.
2. `test(marketplace): cover the accept action visibility rule`
   Component spec: borrower sees Accept and no offer form, lender sees the form and no Accept.
3. `feat(marketplace): add borrower and lender loan screens`
   `/borrow/loans` and `/lend/loans` reading `GET /me/loans?role=`, rendered with Money, Rate,
   and StatusBadge. Nav entries in MarketShell.
4. `test(marketplace): cover the loan screens`
   Component specs for the loaded, empty, and failed states.
5. `test(e2e): accept an offer and see the loan on both sides`
   Playwright: borrower lists, two lenders offer, borrower accepts the cheaper one, borrower sees
   an ACTIVE loan, winning lender sees it under funded loans, losing lender still sees the
   reclaim banner and reclaims.
6. Review by a fresh subagent, fixes as new commits, then the four verify gates and close P4.

## Deviations

- Tasks 3 and 1 swapped: the accept handler navigates to `/borrow/loans`, and the generated route
  tree makes that target a type error until the route file exists, so the loan screens landed first.
- Tasks 2 and 4 dropped. docs/06 defines six layers and none of them is a React component test;
  frontend behaviour belongs to layer 6, and the two SPA workspaces carry no Vitest harness, so
  adding one mid-slice would have been new infrastructure rather than the planned coverage. The
  accept visibility rule is asserted in the Playwright spec instead, which checks that the borrower
  sees Accept and no offer form on their own listing.

## Notes

- Q-014 is recorded only if the review wants the origination fee shown before the click; the
  brainstorm takes the narrowest reading and shows it after acceptance.
- No API changes are expected in this slice. If one turns out to be needed, it goes in as its own
  `feat(api)` task with an integration test rather than being smuggled into a UI commit.
