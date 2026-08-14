# p1b-wallet brainstorm

## What this slice changes

Money becomes visible and usable: `GET /me/balance`, `GET /me/ledger-entries` with cursor
pagination, `POST /me/deposits` (operations only), and `POST /me/withdrawals`, all through the
settlement port from p1a. The `Idempotency-Key` mechanism deferred from p0d lands here as an
interceptor over the idempotency_record table, since these are the first money-moving endpoints.
The marketplace gains the `/wallet` screen and the admin app gains the deposit tool. A Playwright
test funds a member through the admin UI and reads the balance in the marketplace.

## Files touched

New: wallet schemas and client in `packages/contracts`, `modules/ledger/` in the api (deposit and
withdraw use cases, a `WalletQueries` interface with a Prisma implementation in infrastructure,
wallet controller, module), `modules/shared/http/idempotency.interceptor.ts`, marketplace
`/wallet` route, admin `/deposits` route, integration and e2e specs.

Modified: `app.module.ts`, contracts index, app route trees.

## Approaches

Read models: the queries live behind a `WalletQueries` interface in the application layer with a
Prisma implementation in infrastructure, because the boundary rule forbids application importing
infrastructure and docs/01 wants list reads outside repositories. Idempotency is an interceptor
bound per endpoint with a decorator rather than global, so `GET`s and auth stay untouched; it
stores `(key, accountId) -> (status, body)` for 24 hours and replays.

## What could break

Replayed responses must serialise exactly; the stored body is the JSON the controller returned.
Ledger entry cursors use the entry row ids, which are ULIDs and sort by creation. The withdrawal
use case converts a thrown `InsufficientFunds` from the port into a `Result` failure, keeping the
error envelope contract.

## Ambiguity

`docs/04-api-contract.md` puts deposits at `POST /me/deposits` restricted to operations, while
`docs/05-frontend.md` gives the admin app a deposit tool that funds other members. Narrowest
reading that serves both: the operations caller posts `{ email, amount }` and the deposit lands
on the named account, defaulting to the caller's own when the email is omitted. Recorded as
Q-011 in `docs/OPEN-QUESTIONS.md`.
