import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { photographBytes } from './support/photograph';

const apiBase = 'http://localhost:3000/api/v1';
const password = 'a-long-enough-password';
const oneDay = 24 * 60 * 60 * 1000;

/* The offset lives in the api process, which outlives this spec, so it goes
   back to real time whether the test passed or not. */
test.afterEach(async ({ request }) => {
  await request.post(`${apiBase}/test/clock/reset`, { data: {} });
});

async function registerMember(request: APIRequestContext, email: string): Promise<void> {
  const response = await request.post(`${apiBase}/auth/register`, { data: { email, password } });
  expect(response.status()).toBe(201);
}

async function signInApi(request: APIRequestContext, email: string, secret: string): Promise<void> {
  const login = await request.post(`${apiBase}/auth/login`, {
    data: { email, password: secret },
  });
  expect(login.status()).toBe(200);
}

async function issueReceiptFor(request: APIRequestContext, borrowerEmail: string): Promise<string> {
  await signInApi(request, 'staff@demo.test', 'demo-password-123');
  const begun = await request.post(`${apiBase}/vaults/VAULT-DEMO-1/intakes`, {
    headers: { 'idempotency-key': randomUUID() },
    data: { borrowerEmail, itemCategory: 'BULLION', itemDescription: 'One kilogram gold bar' },
  });
  expect(begun.status()).toBe(201);
  const intakeId = ((await begun.json()) as { id: string }).id;

  await request.patch(`${apiBase}/intakes/${intakeId}`, {
    headers: { 'idempotency-key': randomUUID() },
    data: { sealNumber: `SEAL-${randomUUID().slice(0, 8)}` },
  });
  await request.post(`${apiBase}/intakes/${intakeId}/photos`, {
    multipart: {
      photo: {
        name: 'front.jpg',
        mimeType: 'image/jpeg',
        buffer: photographBytes(),
      },
    },
  });
  await request.post(`${apiBase}/intakes/${intakeId}/appraisals`, {
    headers: { 'idempotency-key': randomUUID() },
    data: {
      value: { minorUnits: '500000', currency: 'AUD' },
      method: 'spot times weight',
      comparableReferences: 'LBMA',
    },
  });
  await request.post(`${apiBase}/intakes/${intakeId}/seal`, {
    headers: { 'idempotency-key': randomUUID() },
    data: {},
  });
  const issued = await request.post(`${apiBase}/intakes/${intakeId}/issue-receipt`, {
    headers: { 'idempotency-key': randomUUID() },
    data: { insurancePolicyReference: 'POL-E2E' },
  });
  expect(issued.status()).toBe(201);
  return ((await issued.json()) as { id: string }).id;
}

async function fundAccount(
  request: APIRequestContext,
  email: string,
  minorUnits: string,
): Promise<void> {
  await signInApi(request, 'ops@demo.test', 'demo-password-123');
  const deposit = await request.post(`${apiBase}/me/deposits`, {
    headers: { 'idempotency-key': randomUUID() },
    data: { email, amount: { minorUnits, currency: 'AUD' } },
  });
  expect(deposit.status()).toBe(201);
}

test('operations run a defaulted loan through to settlement', async ({ page, request }) => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const borrowerEmail = `borrower-${stamp}@example.test`;
  const lenderEmail = `lender-${stamp}@example.test`;
  const bidderEmail = `bidder-${stamp}@example.test`;
  for (const email of [borrowerEmail, lenderEmail, bidderEmail]) {
    await registerMember(request, email);
  }
  const receiptId = await issueReceiptFor(request, borrowerEmail);
  await fundAccount(request, lenderEmail, '300000');
  await fundAccount(request, bidderEmail, '400000');

  // Seed the loan through the API; the sale itself is what this spec drives
  // through the interface (docs/06-testing.md).
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
  await signInApi(request, borrowerEmail, password);
  const listing = await request.post(`${apiBase}/listings`, {
    headers: { 'idempotency-key': randomUUID() },
    data: {
      receiptId,
      requestedPrincipal: { minorUnits: '250000', currency: 'AUD' },
      maxAnnualPercentageRateBasisPoints: 2400,
      requestedDurationMs: 30 * oneDay,
      requestedLifetimeMs: 3_600_000,
    },
  });
  const listingId = ((await listing.json()) as { id: string }).id;
  await request.post(`${apiBase}/listings/${listingId}/publish`, {
    headers: { 'idempotency-key': randomUUID() },
    data: {},
  });
  await signInApi(request, lenderEmail, password);
  const offer = await request.post(`${apiBase}/listings/${listingId}/offers`, {
    headers: { 'idempotency-key': randomUUID() },
    data: {
      principal: { minorUnits: '250000', currency: 'AUD' },
      annualPercentageRateBasisPoints: 1800,
      durationMs: 30 * oneDay,
      expiresAt,
    },
  });
  const offerId = ((await offer.json()) as { id: string }).id;
  await signInApi(request, borrowerEmail, password);
  const accepted = await request.post(`${apiBase}/listings/${listingId}/offers/${offerId}/accept`, {
    headers: { 'idempotency-key': randomUUID() },
    data: {},
  });
  expect(accepted.status()).toBe(201);
  const loanId = ((await accepted.json()) as { id: string }).id;

  // Past maturity and grace so the lender can default it.
  await request.post(`${apiBase}/test/clock/advance`, { data: { milliseconds: 38 * oneDay } });
  await signInApi(request, lenderEmail, password);
  const defaulted = await request.post(`${apiBase}/loans/${loanId}/default`, {
    headers: { 'idempotency-key': randomUUID() },
    data: {},
  });
  expect(defaulted.status()).toBe(201);

  // Then past the statutory holding period so the item may be sold.
  await request.post(`${apiBase}/test/clock/advance`, { data: { milliseconds: 31 * oneDay } });
  await signInApi(request, 'ops@demo.test', 'demo-password-123');
  const scheduled = await request.post(`${apiBase}/loans/${loanId}/liquidations`, {
    headers: { 'idempotency-key': randomUUID() },
    data: { reservePrice: { minorUnits: '200000', currency: 'AUD' } },
  });
  expect(scheduled.status()).toBe(201);
  const liquidationId = ((await scheduled.json()) as { id: string }).id;

  await page.goto('/login');
  await page.getByTestId('email-input').fill('ops@demo.test');
  await page.getByTestId('password-input').fill('demo-password-123');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('authenticated-home')).toBeVisible();

  await page.getByRole('link', { name: 'Liquidations' }).click();
  await expect(page.getByTestId('liquidations-table')).toContainText('Scheduled');
  // Nobody has bid, so there is nothing to settle yet.
  await expect(page.getByTestId(`close-${liquidationId}`)).toHaveCount(0);

  await page.getByTestId(`open-${liquidationId}`).click();
  await expect(page.getByTestId('liquidations-table')).toContainText('Taking bids');

  await signInApi(request, bidderEmail, password);
  const bid = await request.post(`${apiBase}/liquidations/${liquidationId}/bids`, {
    headers: { 'idempotency-key': randomUUID() },
    data: { amount: { minorUnits: '300000', currency: 'AUD' } },
  });
  expect(bid.status()).toBe(201);

  await page.reload();
  await expect(page.getByTestId('liquidations-table')).toContainText('AUD 3,000.00');
  await page.getByTestId(`close-${liquidationId}`).click();
  await expect(page.getByTestId('liquidations-table')).toContainText('Settled');

  // The lender is made whole and the borrower keeps what is left over.
  await signInApi(request, lenderEmail, password);
  const lenderBalance = await request.get(`${apiBase}/me/balance`);
  // 300000 funded less the 250000 lent, plus 253698 recovered from the sale.
  expect(((await lenderBalance.json()) as { available: { minorUnits: string } }).available).toEqual(
    { minorUnits: '303698', currency: 'AUD' },
  );

  await signInApi(request, borrowerEmail, password);
  const borrowerBalance = await request.get(`${apiBase}/me/balance`);
  // 245000 disbursed at origination, plus the surplus after the fee.
  expect(
    ((await borrowerBalance.json()) as { available: { minorUnits: string } }).available,
  ).toEqual({ minorUnits: '290376', currency: 'AUD' });
});
