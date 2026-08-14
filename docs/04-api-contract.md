# 04 — API Contract

## Conventions

- Base path `/api/v1`. Version in the path, not a header.
- Resource paths are plural nouns. Actions that are not CRUD are sub-resources with a verb:
  `POST /listings/:id/offers/:offerId/accept`.
- All request and response bodies are defined once as Zod schemas in `packages/contracts` and the
  TypeScript types are inferred from them. Backend validates with the schema; frontend imports the
  same type. There is no separate DTO definition and no hand-written response interface.
- Amounts serialise as `{ minorUnits: string, currency: string }`.
- Timestamps serialise as ISO 8601 strings. Durations serialise as integer milliseconds.
- Every list endpoint is cursor-paginated: `?cursor=&limit=` returning `{ items, nextCursor }`.

## Authentication

Phase 1: session cookie, HTTP-only, SameSite strict. Argon2id password hashing. Roles are
`MEMBER`, `VAULT_STAFF`, `OPERATIONS`, `COMPLIANCE`.

The three frontends authenticate against the same endpoint and differ by which roles they accept.
`MEMBER` covers borrowing and lending — there is no borrower role or lender role.

Phase 3 replaces the login exchange with a wallet signature challenge. The session mechanism is
unchanged. That is why `IdentityPort.resolveAccount` exists.

## Idempotency

Every `POST`, `PATCH`, and `DELETE` accepts an `Idempotency-Key` header. The server stores
`(key, accountId) -> (statusCode, responseBody)` for 24 hours and replays the stored response for a
repeat.

This is not optional politeness. In Phase 3 a chain submission can succeed while the response is
lost, and the client will retry. Building idempotency in Phase 1 means Phase 3 does not need a
retrofit, and it lets you write a test that fires the same request twice and asserts exactly one loan
exists.

## Error responses

```json
{
  "error": {
    "code": "LOAN_TO_VALUE_EXCEEDED",
    "message": "Requested principal exceeds the maximum for this item category.",
    "details": { "maxPrincipal": { "minorUnits": "300000", "currency": "AUD" } }
  }
}
```

`code` is stable and is the only thing clients and tests may branch on. `message` is human-facing and
may change freely. `details` is optional and typed per code.

| HTTP | When |
|---|---|
| 400 | Schema validation failure |
| 401 | Not authenticated |
| 403 | Authenticated but wrong role or not the resource owner |
| 404 | Not found, or found but not visible to this account |
| 409 | State conflict — the resource is not in a state that permits this |
| 422 | Business rule violation — well-formed but rejected by policy |
| 429 | Rate limited |
| 500 | Fault |

The 409 versus 422 distinction: 409 means "try again after refreshing" (offer already accepted). 422
means "this will never work as requested" (loan-to-value exceeded).

## Endpoints

### Accounts

```
POST   /auth/register
POST   /auth/login
POST   /auth/logout
GET    /me
GET    /me/balance
GET    /me/ledger-entries?cursor=&limit=
POST   /me/deposits                      OPERATIONS only in Phase 1
POST   /me/withdrawals
```

### Custody — vault console

```
POST   /vaults/:vaultId/intakes                  begin an intake
PATCH  /intakes/:id                              attach photos, serials, tests
POST   /intakes/:id/appraisals                   record an appraisal
POST   /intakes/:id/seal                         seal, hash the record, lock it
POST   /intakes/:id/issue-receipt                issue the custody receipt
GET    /vaults/:vaultId/inventory?status=
GET    /vaults/:vaultId/exposure
```

`issue-receipt` is the boundary. Before it, an intake is editable. After it, the intake record is
immutable and its hash is committed. The endpoint is separate from `seal` so a supervisor can review
between the two.

### Custody — member

```
GET    /me/receipts
GET    /receipts/:id
POST   /receipts/:id/redemption-requests          burn and request physical release
```

### Custody — release at the counter

```
GET    /redemption-requests?vaultId=&status=
POST   /redemption-requests/:id/verify            staff records identity verification
POST   /redemption-requests/:id/release           staff confirms the item left the vault
```

Two steps, not one. Verification and physical handover are separate events with separate audit
records, because in a dispute you need to know which one failed.

### Marketplace

```
POST   /listings                                  create as DRAFT
POST   /listings/:id/publish
POST   /listings/:id/cancel
GET    /listings?status=&category=&cursor=        public browse
GET    /listings/:id
GET    /me/listings

POST   /listings/:id/offers                       funds are held here
GET    /listings/:id/offers
POST   /listings/:id/offers/:offerId/withdraw
POST   /listings/:id/offers/:offerId/accept       borrower only. Originates the loan.
GET    /me/offers
POST   /me/offers/:offerId/reclaim                reclaim a SUPERSEDED or EXPIRED hold
```

`reclaim` is the pull-not-push endpoint. It exists so accepting an offer on a listing with two
hundred offers is a bounded operation.

### Lending

```
GET    /me/loans?role=borrower|lender
GET    /loans/:id
GET    /loans/:id/payoff-quote                    amount due as of now
POST   /loans/:id/repay
POST   /loans/:id/default                         note holder marks default after grace
POST   /loans/:id/claim-receipt                   note holder takes the receipt
POST   /notes/:id/transfer                        feature-flagged off by default
```

`payoff-quote` returns `{ principal, accruedInterest, total, quotedAt, validUntil }`. The client must
send `quotedAt` back with the repayment so the server can detect a stale quote. Interest moves with
time; a UI that shows a stale figure and then charges a different one is a complaint waiting to
happen.

### Liquidation

```
POST   /loans/:id/liquidations                    OPERATIONS. Enforces the holding period.
POST   /liquidations/:id/open
GET    /liquidations?status=
GET    /liquidations/:id
POST   /liquidations/:id/bids
POST   /liquidations/:id/close                    runs the waterfall, settles
```

### Admin and operations

```
GET    /admin/protocol-parameters
PUT    /admin/protocol-parameters
POST   /admin/pause
POST   /admin/unpause
GET    /admin/reconciliation/latest
POST   /admin/reconciliation/run
GET    /admin/exposure-by-vault
GET    /admin/loan-book                           aggregate position, overdue, at-risk
GET    /admin/audit-log?actor=&subject=&cursor=
```

## Request and response examples

Placing an offer:

```http
POST /api/v1/listings/01HX.../offers
Idempotency-Key: 4f1a...
Content-Type: application/json

{
  "principal": { "minorUnits": "250000", "currency": "AUD" },
  "annualPercentageRateBasisPoints": 1800,
  "durationMs": 2592000000,
  "expiresAt": "2026-09-01T00:00:00.000Z"
}
```

```json
{
  "id": "01HY...",
  "listingId": "01HX...",
  "status": "PENDING",
  "principal": { "minorUnits": "250000", "currency": "AUD" },
  "annualPercentageRateBasisPoints": 1800,
  "durationMs": 2592000000,
  "fundsHold": {
    "id": "01HZ...",
    "settlementRef": { "kind": "ledger", "reference": "01J0...", "settledAt": "2026-08-14T..." }
  },
  "createdAt": "2026-08-14T...",
  "expiresAt": "2026-09-01T00:00:00.000Z"
}
```

Accepting an offer:

```json
{
  "loan": {
    "id": "01J1...",
    "status": "ACTIVE",
    "principal": { "minorUnits": "250000", "currency": "AUD" },
    "annualPercentageRateBasisPoints": 1800,
    "startedAt": "2026-08-14T...",
    "maturesAt": "2026-09-13T...",
    "graceEndsAt": "2026-09-20T..."
  },
  "disbursement": { "minorUnits": "245000", "currency": "AUD" },
  "originationFee": { "minorUnits": "5000", "currency": "AUD" },
  "settlementRef": { "kind": "ledger", "reference": "01J2...", "settledAt": "2026-08-14T..." }
}
```

Every response that resulted from value movement carries a `settlementRef`. This is a contract-level
commitment, and it is what lets Phase 3 arrive without a breaking API change.

## Error codes

Keep this list in `packages/contracts/src/error-codes.ts` as a const object, and have the frontend's
copy map be typed against it so a new code without copy is a compile error.

```
UNAUTHENTICATED  FORBIDDEN  NOT_FOUND  IDEMPOTENCY_KEY_REUSED
INSUFFICIENT_FUNDS  CURRENCY_MISMATCH
RECEIPT_NOT_IN_VAULT  RECEIPT_ENCUMBERED  RECEIPT_ALREADY_BURNED
VAULT_INSURED_LIMIT_EXCEEDED
LISTING_NOT_ACTIVE  LISTING_EXPIRED  LISTING_ALREADY_MATCHED
OFFER_NOT_PENDING  OFFER_EXPIRED  OFFER_WITHDRAWAL_TOO_EARLY
LOAN_TO_VALUE_EXCEEDED  RATE_ABOVE_MAXIMUM
LOAN_NOT_ACTIVE  LOAN_NOT_MATURED  GRACE_PERIOD_ACTIVE
REPAYMENT_AMOUNT_INSUFFICIENT  PAYOFF_QUOTE_STALE
HOLDING_PERIOD_ACTIVE  LIQUIDATION_NOT_OPEN  BID_BELOW_RESERVE
NOTE_TRANSFER_DISABLED
SYSTEM_PAUSED
```
