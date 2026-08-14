# 05 — Frontend

## Three applications, one shared package

| App | Users | Roles |
|---|---|---|
| `apps/marketplace` | Borrowers and lenders | `MEMBER` |
| `apps/vault-console` | Vault staff, appraisers | `VAULT_STAFF` |
| `apps/admin` | Operations, compliance | `OPERATIONS`, `COMPLIANCE` |

Borrowing and lending are the same app with no role gate, because the same person will do both and a
role switch would be friction with no security benefit. The vault console is separate because it is
used on a fixed terminal by staff with a different threat model and a very different interaction
style: barcode scanners, cameras, printed labels, no marketing chrome.

`packages/ui` holds design tokens, primitives (Button, Field, Money, StatusBadge, DataTable), and the
authenticated shell. It is built in P0.5, before any product slice, per `docs/13-design-system.md`. Feature components stay in their own app. Do not promote a component to
`packages/ui` until a second app needs it.

## Stack

- Vite, React 19, TypeScript strict
- TanStack Router — file-based routes, typed params, typed search params
- TanStack Query — all server state
- React Hook Form + the Zod schemas from `packages/contracts`
- Tailwind, extending the shared preset in `packages/ui/tailwind.preset.ts`

Colour, typography, spacing, and density are owned by `docs/13-design-system.md` and fixed in
`packages/ui/src/tokens.css`. Nothing in this document overrides that. No app file contains a raw
colour, font family, or pixel spacing value; `scripts/check-design-tokens.sh` enforces it.

## State rules

**Server state lives in TanStack Query. Nothing else.** No Redux, no Zustand for anything that came
from an API. If you find yourself copying query data into local state, you are about to create a
staleness bug.

Local state is for: form drafts, modal open/closed, table sort, filter panel expansion.

Query keys are built by a typed factory, never string-concatenated inline:

```ts
export const listingKeys = {
  all: ['listings'] as const,
  browse: (filters: BrowseFilters) => [...listingKeys.all, 'browse', filters] as const,
  detail: (id: ListingId) => [...listingKeys.all, 'detail', id] as const,
  offers: (id: ListingId) => [...listingKeys.detail(id), 'offers'] as const,
};
```

After a mutation, invalidate by the narrowest key that is actually stale. Blanket
`invalidateQueries()` hides bugs and makes the app feel slow.

## The API client

One generated-by-hand typed client in `packages/contracts/src/client`. Every method takes and returns
the inferred Zod types. There is no `fetch` call anywhere in a component.

```ts
export async function placeOffer(
  listingId: ListingId,
  body: PlaceOfferRequest,
  options: RequestOptions,
): Promise<PlaceOfferResponse>;
```

`RequestOptions` carries the idempotency key. Every mutation hook generates one with `crypto.randomUUID()`
on mount, not on submit, so a double-click sends the same key twice and the server deduplicates.

## Rendering money and rates

Two primitives, used everywhere, never bypassed.

```tsx
<Money value={loan.principal} />                  // AUD 2,500.00
<Rate basisPoints={loan.annualPercentageRateBasisPoints} />   // 18.00% p.a.
```

`Money` takes the `{ minorUnits: string, currency }` shape straight from the API and does its own
`Intl.NumberFormat`. There is no place in the app where an amount is a JavaScript `number`.

## Marketplace app — routes

```
/                              landing, live listings
/listings                      browse with filters
/listings/:listingId           detail, offer book, place offer
/borrow
  /borrow/receipts             my receipts, list one
  /borrow/listings             my listings and their offers
  /borrow/loans                my loans, payoff, repay
  /borrow/redemptions          redemption requests and their status
/lend
  /lend/offers                 my outstanding offers, reclaim superseded holds
  /lend/loans                  my funded loans, mark default, claim receipt
/wallet                        balance, ledger history, deposit, withdraw
/settings
```

Screens that need care:

**Listing detail.** Shows the appraisal, category, vault, photos, the offer book ranked by total
borrower cost, and the LTV cap as a hard ceiling on the offer form. The form must show the borrower's
requested principal as the default and make the rate the thing the lender competes on. Disable submit
above the cap client-side and let the server reject it too.

**Payoff and repay.** Fetch the quote, show a countdown to `validUntil`, refetch on expiry. Submitting
sends `quotedAt`. If the server returns `PAYOFF_QUOTE_STALE`, refetch and show the new figure rather
than silently retrying — the amount changed and the user must see it.

**Reclaim funds.** A persistent banner when the account has superseded or expired holds. This is
money the user cannot spend and does not know about. It should be impossible to miss.

## Vault console — routes

```
/intake                        start a new intake
/intake/:intakeId              the wizard
/inventory                     everything in this vault, filterable by status
/inventory/:receiptId
/releases                      queue of redemption requests awaiting release
/releases/:requestId           verify identity, then confirm release
/exposure                      insured limit vs current exposure
```

The intake wizard is a linear stepper with a persisted draft: identify, photograph, test and
authenticate, appraise, seal, review, issue. Each step saves to the server. The final two steps are
irreversible and must have a confirmation that states plainly what becomes immutable.

Design for the environment: large touch targets, high contrast, works at 1366×768, keyboard-first,
and every screen usable without a mouse.

## Admin app — routes

```
/                              loan book overview
/loans                         all loans, filter by status, overdue, at risk
/liquidations
/reconciliation                latest run, drift items, run now
/parameters                    protocol parameters, with an effective-date change
/audit                         audit log search
/accounts
/system                        pause, unpause, health
```

The reconciliation screen is the most important one in the entire product. It shows, for each vault,
three numbers that must agree: physical inventory count, database receipt count, and (in Phase 3)
on-chain receipt count. Any disagreement is a red row with a drill-down. Build it in Phase 1 with two
columns and add the third in Phase 3.

## Component conventions

- One component per file, named export, file named after the component in kebab-case.
- Components receive data as props. Only route-level components and container components call hooks
  that fetch. This keeps presentational components testable without a query client.
- No component over roughly 150 lines. Past that, extract a subcomponent or a hook.
- Every loading state is a skeleton matching the final layout, not a spinner. Every error state is a
  message keyed off the error `code` from `packages/contracts`.
- No `useEffect` for data fetching. Ever. That is what TanStack Query is for.
- Forms: schema from `packages/contracts`, resolver from `@hookform/resolvers/zod`. Field-level errors
  come from the schema; form-level errors come from the API error `code`.

## Accessibility floor

Not optional and not a later phase. Labels on every input, focus visible, a logical tab order,
`aria-live` on the toast region, and colour never the sole carrier of status — every badge has text.
Playwright runs `@axe-core/playwright` on each primary route and fails on serious violations.

## What Phase 3 changes in the frontend

Very little, which is the point.

- A wallet connection replaces the password login on the marketplace app. `@mysten/dapp-kit-react`.
- Mutations that were "call API, get response" become "call API for unsigned transaction bytes, sign
  in wallet, submit, poll for confirmation". This is a change to the mutation hooks, not the screens.
- `settlementRef.reference` starts rendering as an explorer link when `settlementRef.kind === 'chain'`.
  Write the component that way in Phase 1 with the chain branch unreachable.
- A "confirming" state appears between submission and indexer catch-up. Design the status badges in
  Phase 1 with a `PENDING_CONFIRMATION` variant that Phase 1 never emits.

The vault console and admin app change almost not at all — staff will keep using session auth.
