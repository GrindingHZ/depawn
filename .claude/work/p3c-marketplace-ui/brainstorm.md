# p3c-marketplace-ui brainstorm

## What this slice changes

The marketplace app grows its lending surfaces: public browse and listing detail with the ranked
offer book and the place offer form (requested principal prefilled, the LTV cap a hard ceiling
client side with the server rejecting too), listing creation and publishing from the borrower's
receipts, a my listings screen with cancel, a lender offers screen with reclaim, and the
persistent reclaim banner that appears wherever the member lands while reclaimable holds exist.
A cross app Playwright test walks receipt to listing to a funded offer visible in the book, with
the ceiling proven as the failure path.

## Files touched

New marketplace routes: `listings.index.tsx`, `listings.$listingId.tsx`, `borrow.listings.tsx`,
`lend.offers.tsx`; components `reclaim-banner.tsx`, `listing-status-tone.ts`, `market-keys.ts`;
a List action on `borrow.receipts.tsx`; `e2e/tests/marketplace.listing.spec.ts`.

Modified: home navigation, borrow receipts screen.

## Approaches

The offer book and balances stay entirely in TanStack Query with invalidation after each
mutation. Listing creation happens in a dialog on the receipts screen, publishing immediately
after creating, because a draft listing has no separate demo value; my listings still shows and
cancels drafts if publish fails midway. The e2e seeds the receipt through the intake API with
Playwright's multipart support rather than driving the wizard again, per the seed-through-API
rule in docs/06.

## What could break

The withdraw path stays integration-only: the ten minute minimum lifetime cannot elapse in
Playwright without the test clock endpoint, which docs/06 assigns to the e2e harness and lands
with the P5 servicing slice where maturity also needs it. Recorded as a follow up there.

## Ambiguity

The reclaim banner queries the member's offers on the screens the member actually visits (home,
wallet, lend offers, borrow screens) rather than a global layout, since each route builds its
own shell until a shared authenticated layout exists; the banner component is one import per
screen.
