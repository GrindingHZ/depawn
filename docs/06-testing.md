# 06: Testing

## What we are actually protecting against

Three failure classes, in descending order of how much they would hurt:

1. **Money is wrong.** An unbalanced ledger, a double repayment, a lost hold, a rounding leak.
2. **State is wrong.** An item released against a live loan, a listing matched twice, a receipt
   encumbered by two loans.
3. **The screen is wrong.** A stale payoff figure, a button that does nothing.

The test strategy allocates effort in that order. Most of the value is in the bottom two layers of
the pyramid, not in end-to-end tests.

## Runner setup

Vitest for both backend and frontend. One runner across the monorepo is worth the small configuration
cost.

NestJS under Vitest needs `unplugin-swc` so decorators and `emitDecoratorMetadata` work:

```ts
// apps/api/vitest.config.ts
import swc from 'unplugin-swc';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['test/setup.ts'],
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
```

Separate project configs for `unit` and `integration` so `pnpm test:unit` stays under two seconds and
runs on every save.

## Layer 1: domain unit tests

No database, no NestJS container, no mocks of things you own. Construct an entity, call a method,
assert the result.

Target: every pure policy function and every state machine transition, including the illegal ones.

```ts
describe('calculateAccruedInterest', () => {
  it('returns zero at the moment of origination', () => { ... });

  it('accrues linearly through the term', () => { ... });

  it('stops accruing at maturity', () => {
    const wellPastMaturity = maturesAt.plusMilliseconds(90n * MILLISECONDS_PER_DAY);
    expect(calculateAccruedInterest(principal, 1800, startedAt, maturesAt, wellPastMaturity))
      .toEqual(calculateAccruedInterest(principal, 1800, startedAt, maturesAt, maturesAt));
  });

  it('does not overflow on a large principal held for a full term', () => {
    const largePrincipal = Money.of(10_000_000_000n, 'AUD');
    expect(() => calculateAccruedInterest(largePrincipal, 3600, startedAt, maturesAt, maturesAt))
      .not.toThrow();
  });

  it('truncates in the borrower\'s favour', () => { ... });
});
```

State machines get a table-driven test that walks every `(from, event)` pair and asserts either the
expected target state or a specific rejection. Write the table once as data:

```ts
const cases: TransitionCase[] = [
  { from: 'ACTIVE', event: 'accept', expect: 'MATCHED' },
  { from: 'MATCHED', event: 'accept', expect: { rejectedWith: 'LISTING_ALREADY_MATCHED' } },
  { from: 'CANCELLED', event: 'accept', expect: { rejectedWith: 'LISTING_NOT_ACTIVE' } },
  ...
];
```

When a state is added and the table is not updated, the exhaustiveness check fails at compile time.

## Layer 2: property tests on the ledger

`fast-check`. These are cheap and they catch the bugs that hand-written cases never do.

```ts
test.prop([arbitraryTransactionShape()])('every ledger transaction balances', (shape) => {
  const transaction = LedgerTransaction.build(shape);
  const debits = sumOf(transaction.entries, 'DEBIT');
  const credits = sumOf(transaction.entries, 'CREDIT');
  expect(debits).toEqual(credits);
});

test.prop([arbitraryLiquidation()])('the waterfall distributes exactly the proceeds', (input) => {
  const distributions = distributeLiquidationProceeds(input.proceeds, input.owed, parameters);
  expect(sumOf(distributions)).toEqual(input.proceeds);
});

test.prop([arbitraryLoan(), arbitraryInstant()])('amount due never decreases with time', (loan, t) => {
  ...
});
```

## Layer 3: port contract tests

This is the highest-leverage idea in the whole test suite, so read this section twice.

Write **one** test suite against the `SettlementPort` interface. Run it against every implementation.

```ts
// packages/test-support/src/settlement-port.contract.ts
export function describeSettlementPortContract(
  name: string,
  createSubject: () => Promise<SettlementPortTestSubject>,
) {
  describe(`SettlementPort contract: ${name}`, () => {
    it('makes held funds unavailable to the holder', async () => { ... });
    it('refunds a hold exactly once even if called twice', async () => { ... });
    it('releases a hold to a distribution that sums to the held amount', async () => { ... });
    it('rejects a release whose distribution does not sum to the held amount', async () => { ... });
    it('returns a settlement reference that resolves to the movement', async () => { ... });
    it('rejects a hold exceeding the available balance', async () => { ... });
  });
}
```

```ts
// Phase 1
describeSettlementPortContract('ledger', createLedgerSubject);

// Phase 3: same file, one line added
describeSettlementPortContract('sui', createSuiLocalnetSubject);
```

When the Sui adapter passes the suite the Phase 1 adapter passes, the migration is provably
behaviour-preserving at the seam. Do the same for `CustodyPort`.

## Layer 4: integration tests

Real Postgres via Testcontainers. Real NestJS application. HTTP through Supertest. No mocks except
the clock, which is a `FixedClockAdapter` you advance explicitly.

```ts
describe('POST /listings/:id/offers/:offerId/accept', () => {
  let app: INestApplication;
  let clock: FixedClockAdapter;

  beforeAll(async () => {
    ({ app, clock } = await createTestApplication());
  });

  beforeEach(() => truncateAllTables());

  it('originates a loan, disburses net of fee, and supersedes losing offers', async () => {
    const scenario = await seedListingWithOffers({ offerCount: 3 });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/listings/${scenario.listingId}/offers/${scenario.winningOfferId}/accept`)
      .set('Cookie', scenario.borrowerSession)
      .set('Idempotency-Key', randomUUID())
      .expect(201);

    expect(response.body.loan.status).toBe('ACTIVE');
    expect(response.body.settlementRef.kind).toBe('ledger');

    await expectBalance(scenario.borrowerId).toEqual(money('245000'));
    await expectBalance(scenario.platformFeeAccount).toEqual(money('5000'));
    await expectLedgerBalances().toSumToZero();

    const losingOffers = await fetchOffers(scenario.listingId, 'SUPERSEDED');
    expect(losingOffers).toHaveLength(2);
    for (const offer of losingOffers) {
      await expectHeldBalance(offer.lenderAccountId).toBeGreaterThan(zero());
    }
  });
});
```

Note the last assertion: losing lenders' funds are **still held**, not refunded. The test encodes the
pull-not-push decision so nobody quietly changes it.

**Every integration test that moves money ends with `expectLedgerBalances().toSumToZero()`.** Put it
in a global `afterEach` so it is impossible to forget.

### Idempotency tests

For every mutation endpoint:

```ts
it('creates exactly one loan when the same request is sent twice', async () => {
  const key = randomUUID();
  const first = await acceptOffer(scenario, key).expect(201);
  const second = await acceptOffer(scenario, key).expect(201);

  expect(second.body).toEqual(first.body);
  expect(await countLoans()).toBe(1);
  expect(await countLedgerTransactions('ORIGINATE_LOAN')).toBe(1);
});
```

### Concurrency tests

These find the bugs that matter most and they are usually missing.

```ts
it('accepts only one offer when two acceptances race', async () => {
  const scenario = await seedListingWithOffers({ offerCount: 2 });

  const results = await Promise.allSettled([
    acceptOffer(scenario, scenario.offerA),
    acceptOffer(scenario, scenario.offerB),
  ]);

  expect(countFulfilledWithStatus(results, 201)).toBe(1);
  expect(countFulfilledWithStatus(results, 409)).toBe(1);
  expect(await countLoans()).toBe(1);
});

it('holds funds only once when a lender places two offers concurrently with a balance for one', async () => { ... });

it('repays a loan only once under concurrent repayment', async () => { ... });
```

Run each of these in a loop of at least twenty iterations in CI. A race that fails one time in ten is
still a bug.

### Time-dependent tests

The fixed clock makes these ordinary tests, not flaky ones.

```ts
it('rejects a default claim during the grace period', async () => {
  clock.advanceTo(loan.maturesAt.plusMilliseconds(ONE_DAY));
  await claimDefault(loan).expect(422).expect(errorCode('GRACE_PERIOD_ACTIVE'));
});

it('rejects a liquidation before the statutory holding period elapses', async () => { ... });
```

## Layer 5: API flow tests

A separate suite that runs the entire lifecycle as a single scripted scenario against a running
server, in order, asserting at each step. This is the test that proves the flows in `docs/10-flows.md`
are real.

```ts
describe('full lifecycle: intake to redemption', () => {
  it('walks the happy path', async () => {
    const vault = await api.admin.createVault(...);
    const intake = await api.vault.beginIntake(...);
    await api.vault.recordAppraisal(intake.id, ...);
    await api.vault.seal(intake.id);
    const receipt = await api.vault.issueReceipt(intake.id, { holder: borrower.id });

    const listing = await api.member.createListing(borrower, { receiptId: receipt.id, ... });
    await api.member.publishListing(borrower, listing.id);

    const offerA = await api.member.placeOffer(lenderA, listing.id, { rateBasisPoints: 2200 });
    const offerB = await api.member.placeOffer(lenderB, listing.id, { rateBasisPoints: 1800 });

    const loan = await api.member.acceptOffer(borrower, listing.id, offerB.id);
    expect(loan.settlementRef.reference).toBeTruthy();

    clock.advance(FIFTEEN_DAYS);
    const quote = await api.member.payoffQuote(borrower, loan.id);
    await api.member.repay(borrower, loan.id, quote);

    const redemption = await api.member.requestRedemption(borrower, receipt.id);
    await api.vault.verifyIdentity(staff, redemption.id);
    await api.vault.confirmRelease(staff, redemption.id);

    await expectReceiptStatus(receipt.id).toBe('RELEASED');
    await expectLedgerBalances().toSumToZero();
    await api.member.reclaim(lenderA, offerA.id);
    await expectHeldBalance(lenderA.id).toEqual(zero());
  });
});
```

Write one of these per major path: happy repayment, default and claim, default and liquidation with
surplus, default and liquidation at a loss, cancellation, and offer withdrawal.

Keep an equivalent `.http` file collection in `apps/api/http/` for manual poking. It is not a
substitute for the suite but it is how you will actually debug.

## Layer 6: Playwright

Three Playwright projects, one per app, sharing a fixture package.

```ts
// e2e/playwright.config.ts
projects: [
  { name: 'setup', testMatch: /global\.setup\.ts/ },
  { name: 'marketplace',   dependencies: ['setup'], use: { baseURL: MARKETPLACE_URL, storageState: 'e2e/.auth/member.json' } },
  { name: 'vault-console', dependencies: ['setup'], use: { baseURL: VAULT_URL,       storageState: 'e2e/.auth/staff.json' } },
  { name: 'admin',         dependencies: ['setup'], use: { baseURL: ADMIN_URL,        storageState: 'e2e/.auth/ops.json' } },
]
```

Rules:

- **Selectors are `getByRole` and `getByTestId`. Never CSS classes, never text that is marketing copy.**
  A refactor of Tailwind classes must not break a test.
- **No `waitForTimeout`.** Ever. Wait on a locator, a response, or a network idle condition.
- **Seed through the API, assert through the UI.** Setting up a loan by clicking through eight screens
  makes a slow, brittle test that fails for reasons unrelated to what it tests. Use an API fixture to
  reach the state, then drive the one flow under test.
- Each test creates its own accounts with unique emails. No shared mutable fixtures between tests.
- Time control: the API exposes a `POST /test/clock/advance` endpoint, mounted only when
  `NODE_ENV === 'test'`, so Playwright can move the loan to maturity without waiting thirty days.

The cross-app test is the one worth writing carefully, because it is the demo:

```ts
test('an item goes from vault intake to a funded loan to redemption', async ({ browser }) => {
  const staff = await browser.newContext({ storageState: 'e2e/.auth/staff.json' });
  const borrower = await browser.newContext({ storageState: 'e2e/.auth/member.json' });
  const lender = await browser.newContext({ storageState: 'e2e/.auth/lender.json' });

  const staffPage = await staff.newPage();
  await staffPage.goto('/intake');
  await completeIntakeWizard(staffPage, { category: 'BULLION', appraisedValue: '5000.00' });
  const receiptId = await staffPage.getByTestId('issued-receipt-id').textContent();

  const borrowerPage = await borrower.newPage();
  await borrowerPage.goto('/borrow/receipts');
  await borrowerPage.getByTestId(`receipt-${receiptId}`).getByRole('button', { name: 'List' }).click();
  ...

  const lenderPage = await lender.newPage();
  await lenderPage.goto('/listings');
  ...

  await expect(borrowerPage.getByTestId('loan-status')).toHaveText('Active');
  await expect(borrowerPage.getByTestId('settlement-reference')).toBeVisible();
});
```

Also run, per app: `@axe-core/playwright` on primary routes, and a visual snapshot on the three
highest-traffic screens with a generous threshold.

## CI

```
lint + typecheck        every push
unit + property         every push
integration             every push (Testcontainers)
port contract           every push
api flow                every push
playwright              every push, sharded 4 ways
axe                     every push
```

Nothing is nightly-only. A test that only runs nightly is a test nobody fixes.

Coverage: enforce 90% on `src/domain/`, do not enforce a number anywhere else. Coverage of
controllers and adapters is a vanity metric; coverage of the interest calculator is not.

---

## Phase 3 additions: testing against the chain

### Move unit tests

`sui move test`. Every `assert!` gets a test that triggers it, using `#[expected_failure(abort_code = ...)]`.
`test_scenario` for anything spanning multiple transactions or senders, because object ownership only
settles between transactions.

Mirror the Phase 1 domain test names exactly. `calculate_accrued_interest` in Move should have the
same test list as `calculateAccruedInterest` in TypeScript, and both should agree on the same
fixtures. Keep the fixtures in a shared JSON file that both suites read. If they ever disagree, one of
them is wrong and you will know immediately.

### Localnet integration

`sui start` in CI, or a Testcontainers image. Publish the package fresh per suite run, capture the
package id, and inject it into the adapter's configuration.

```ts
it('originates a loan on chain and returns a real digest', async () => {
  const result = await suiSettlementAdapter.releaseHold(hold, distributions, context);

  expect(result.kind).toBe('chain');
  expect(result.reference).toMatch(/^[A-Za-z0-9]{40,}$/);

  const transaction = await client.ledgerService.getTransaction({ digest: result.reference });
  expect(transaction.response.transaction?.effects?.status?.$kind).toBe('Success');
});
```

Assert on **effects**, not on the absence of a thrown error. A transaction can be submitted
successfully and still abort on chain. The SDK returns failure as a value, not an exception:

```ts
const result = await keypair.signAndExecuteTransaction({ transaction, client, include: { effects: true } });
if (result.$kind === 'FailedTransaction') { ... }
```

Every chain test must check `$kind`.

### Event and object assertions

```ts
it('emits LoanOriginated with the expected fields', async () => {
  const digest = await originateOnChain(scenario);
  const events = await fetchEventsForDigest(digest);

  const originated = events.find((event) => event.type.endsWith('::marketplace::LoanOriginated'));
  expect(originated?.parsedJson).toMatchObject({
    listing_id: scenario.listingObjectId,
    principal: '250000',
  });
});

it('leaves the receipt object encumbered and owned by the loan', async () => {
  const { object } = await client.core.getObject({ objectId: scenario.receiptObjectId });
  expect(object.content.status).toBe(ENCUMBERED);
});
```

### Indexer tests

The indexer is where Phase 3 bugs actually live. Three tests, all mandatory:

```ts
it('is idempotent when the same event is processed twice', async () => {
  await indexer.process(event);
  await indexer.process(event);
  expect(await countLoans()).toBe(1);
});

it('resumes from its cursor after a restart without replaying', async () => { ... });

it('reconstructs identical state from a full replay from genesis', async () => {
  const liveState = await snapshotProjection();
  await truncateProjection();
  await indexer.replayFrom(0);
  expect(await snapshotProjection()).toEqual(liveState);
});
```

That third test is the one that tells you your projection is a pure function of the chain. If it
fails, you have hidden state and reconciliation will eventually disagree.

### Reconciliation tests

```ts
it('reports drift when the projection disagrees with the chain', async () => {
  await corruptProjectionRow(loanId);
  const report = await reconciliation.run();
  expect(report.drift).toContainEqual(expect.objectContaining({ loanId, field: 'status' }));
});
```

### Playwright with a wallet

Use a headless keypair injected into the page context rather than a browser extension. Expose a test
wallet adapter behind `VITE_TEST_WALLET=1` that signs with a fixture key from the app's own code. The
alternative, driving a real extension, is slow and flaky, and it tests the extension rather than
your application.

Assert the digest appears in the UI and links to the explorer:

```ts
await expect(page.getByTestId('settlement-reference')).toHaveAttribute('href', /suiscan|suivision/);
```
