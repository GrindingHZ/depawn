# p3c-marketplace-ui review (final, after d5da772)

## Blocking finding 1: idempotency keys at submit time. Closed in 35baea0.
Commit 35baea0 moved all three mutations to keys generated on mount, matching docs/05-frontend.md
and the place-offer precedent. Verified in the previous review pass against the server interceptor
and the Prisma store: double clicks replay or 409, onSuccess rotates keys for the next distinct
action, failure retries claim cleanly, cross-row races 409 on payload mismatch, and the
create-and-publish dialog recovers a failed publish without duplicating the listing.

## Blocking finding 2: banner persistence. Closed in d5da772.
Commit d5da772 swaps routes/wallet.tsx from its bespoke AppShell onto MarketShell. The diff removes
the AppShell import and the hand-rolled two-link navigation and wraps the page content in
MarketShell, which renders ReclaimBanner (market-shell.tsx:50) above every authenticated screen.
The banner therefore now shows on /wallet, the screen the original finding named, and the wallet
gains the unified five-link navigation and logout for free. Grep over apps/marketplace/src confirms
the only remaining direct AppShell uses are market-shell.tsx itself and routes/gallery.tsx, the
primitive gallery, which along with login legitimately stays outside the shell.

## Non-blocking (carried forward)
- apps/marketplace/src/routes/listings.$listingId.tsx:146 prefills the principal with BigInt(minorUnits) / 100n, which floors away cents. A requested principal of 2500.50 prefills as 2500 and a lender who submits unchanged funds less than requested. Format from minor units without truncating.
- e2e/tests/marketplace.listing.spec.ts:113 and :153 click the first link in the browse table. Browse shows every live listing, so a listing created by another spec file running in parallel can be the first row. The browse table already renders data-testid listing-<id>; navigate by the listing id instead.
- e2e/tests/marketplace.listing.spec.ts:134-142: the second test builds the listing by clicking through the borrower UI as setup for the ceiling assertion. docs/06-testing.md says to seed state that is not the flow under test through the API. The first test legitimately drives listing creation as its subject; the second should seed it.
- The plan's design pass promises a cancel Button with Dialog confirmation on borrower listings; borrow.listings.tsx:131 cancels immediately with no confirmation. Either add the confirmation or correct the plan.
- Forms in this slice use useState plus toMinorUnits validation rather than React Hook Form with the Zod schemas from packages/contracts as docs/05-frontend.md specifies. This follows the precedent already accepted in wallet.tsx, so recording it rather than blocking on it; a future cleanup slice should decide which convention stands.
- In the list dialog, if create succeeds, publish fails, and the user then edits the form before resubmitting, the same createKey travels with a changed body and the server answers 409 IDEMPOTENCY_KEY_REUSED, surfaced as the generic create failure message. Publish failures are rare and nothing duplicates, so this is cosmetic; resetting both keys when the payload changes would remove the dead end.
- Process deviations recorded in plan.md: commit a2c3569 was briefly red on typecheck, against the commit-at-every-green-task rule, and two feat tasks landed in cc68576 through a pathspec mistake. Both are honestly recorded, history rewriting is banned, and the final tree is green, so no action beyond the record.
- The marketplace dev server moved from 5173 to 5273 with strictPort across the vite configs and Playwright config because an unrelated project on this machine holds 5173. Environment fix, not product behaviour; no stray 5173 references remain.

## Verification
- git show HEAD (d5da772): wallet.tsx now imports MarketShell, no bespoke AppShell left; one-line commit message matching type(scope): summary with no body or trailers
- pnpm check : exit 0
- pnpm test:unit : exit 0 (api 61 tests, ui 31 tests, all passing)
- Implementer reports 13/13 Playwright e2e green after the change

## Verdict
APPROVED
