# p3c-marketplace-ui plan

## Tasks

- [x] feat(marketplace-ui): add browse and listing detail with the offer book (this commit was
      briefly red on typecheck because the shell linked to routes landing in the next commit)
- [x] feat(marketplace-ui): add listing creation from receipts and my listings
- [x] feat(marketplace-ui): add lender offers with the reclaim banner (landed inside the previous
      commit through the same git pathspec mistake as p3a; recorded, not rewritten)
- [ ] test(e2e): fund a listing offer from browse to the offer book

## Design pass

- Browse: AppShell, Card per listing or DataTable, Money, Rate, StatusBadge (listing states:
  ACTIVE active, MATCHED success, DRAFT neutral, CANCELLED neutral, EXPIRED neutral), EmptyState,
  Skeleton.
- Listing detail: Card sections for the item (appraised value, category, LTV ceiling), the offer
  book (DataTable with Money and Rate columns ranked by total cost), and the offer form (Field,
  Button); the submit disables client side above the ceiling and the server 422 shows as a
  role="alert" line keyed off LOAN_TO_VALUE_EXCEEDED and RATE_ABOVE_MAXIMUM.
- Borrower listings: DataTable, StatusBadge, cancel Button with Dialog confirmation.
- Lender offers: DataTable, StatusBadge (PENDING active, ACCEPTED success, SUPERSEDED warning,
  WITHDRAWN and EXPIRED neutral), reclaim Button.
- Reclaim banner: a full width Card variant with status-warning border and text plus the reclaim
  link; rendered above the page content wherever reclaimable holds exist. Colour never the sole
  carrier: the banner text names the count.
