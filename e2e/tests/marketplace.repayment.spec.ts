import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import { photographBytes } from './support/photograph';

const apiBase = 'http://localhost:3000/api/v1';
const password = 'a-long-enough-password';
const oneDay = 24 * 60 * 60 * 1000;

async function registerMember(request: APIRequestContext, email: string): Promise<void> {
  const response = await request.post(`${apiBase}/auth/register`, { data: { email, password } });
  expect(response.status()).toBe(201);
}

/* Seed the loan through the API and drive only the repayment through the UI
   (docs/06-testing.md). */
async function issueReceiptFor(request: APIRequestContext, borrowerEmail: string): Promise<string> {
  await request.post(`${apiBase}/auth/login`, {
    data: { email: 'staff@demo.test', password: 'demo-password-123' },
  });
  const begun = await request.post(`${apiBase}/vaults/VAULT-DEMO-1/intakes`, {
    headers: { 'idempotency-key': randomUUID() },
    data: {
      borrowerEmail,
      itemCategory: 'BULLION',
      itemDescription: 'One kilogram gold bar',
    },
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
  await request.post(`${apiBase}/auth/logout`);
  return ((await issued.json()) as { id: string }).id;
}

async function fundAccount(
  request: APIRequestContext,
  email: string,
  minorUnits: string,
): Promise<void> {
  await request.post(`${apiBase}/auth/login`, {
    data: { email: 'ops@demo.test', password: 'demo-password-123' },
  });
  const deposit = await request.post(`${apiBase}/me/deposits`, {
    headers: { 'idempotency-key': randomUUID() },
    data: { email, amount: { minorUnits, currency: 'AUD' } },
  });
  expect(deposit.status()).toBe(201);
  await request.post(`${apiBase}/auth/logout`);
}

async function originateLoan(
  request: APIRequestContext,
  borrowerEmail: string,
  lenderEmail: string,
  receiptId: string,
): Promise<void> {
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
  await request.post(`${apiBase}/auth/login`, { data: { email: borrowerEmail, password } });
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
  expect(listing.status()).toBe(201);
  const listingId = ((await listing.json()) as { id: string }).id;
  await request.post(`${apiBase}/listings/${listingId}/publish`, {
    headers: { 'idempotency-key': randomUUID() },
    data: {},
  });

  await request.post(`${apiBase}/auth/login`, { data: { email: lenderEmail, password } });
  const offer = await request.post(`${apiBase}/listings/${listingId}/offers`, {
    headers: { 'idempotency-key': randomUUID() },
    data: {
      principal: { minorUnits: '250000', currency: 'AUD' },
      annualPercentageRateBasisPoints: 1800,
      durationMs: 30 * oneDay,
      expiresAt,
    },
  });
  expect(offer.status()).toBe(201);
  const offerId = ((await offer.json()) as { id: string }).id;

  await request.post(`${apiBase}/auth/login`, { data: { email: borrowerEmail, password } });
  const accepted = await request.post(`${apiBase}/listings/${listingId}/offers/${offerId}/accept`, {
    headers: { 'idempotency-key': randomUUID() },
    data: {},
  });
  expect(accepted.status()).toBe(201);
  await request.post(`${apiBase}/auth/logout`);
}

/* The offset lives in the api process, which outlives this spec, so it goes
   back to real time whether the test passed or not. */
test.afterEach(async ({ request }) => {
  await request.post(`${apiBase}/test/clock/reset`, { data: {} });
});

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('authenticated-home')).toBeVisible();
}

test('a borrower repays a matured loan and the item comes back', async ({ page, request }) => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const borrowerEmail = `borrower-${stamp}@example.test`;
  const lenderEmail = `lender-${stamp}@example.test`;
  await registerMember(request, borrowerEmail);
  await registerMember(request, lenderEmail);
  const receiptId = await issueReceiptFor(request, borrowerEmail);
  await fundAccount(request, lenderEmail, '300000');
  await fundAccount(request, borrowerEmail, '50000');
  await originateLoan(request, borrowerEmail, lenderEmail, receiptId);

  // The test only clock endpoint carries the loan ten days into its term so
  // there is real interest to pay (docs/06-testing.md).
  const advanced = await request.post(`${apiBase}/test/clock/advance`, {
    data: { milliseconds: 10 * oneDay },
  });
  expect(advanced.status()).toBe(201);

  await signIn(page, borrowerEmail);
  await page.getByRole('link', { name: 'My loans' }).click();
  await expect(page.getByTestId('my-loans')).toContainText('Running');

  await expect(page.getByTestId('payoff-total')).toContainText('AUD 2,512.32');
  await expect(page.getByTestId('payoff-interest')).toContainText('AUD 12.32');
  await expect(page.getByTestId('payoff-countdown')).toContainText('seconds');

  await page.getByRole('button', { name: 'Repay and release the item' }).click();
  await expect(page.getByTestId('my-loans')).toContainText('Repaid');

  await page.getByRole('link', { name: 'My receipts' }).click();
  await expect(page.getByTestId('my-receipts')).toContainText('In the vault');

  await page.getByRole('link', { name: 'Wallet' }).click();
  // 2450.00 disbursed plus 500.00 funded less the 2512.32 repaid.
  await expect(page.getByTestId('available-balance')).toHaveText('AUD 437.68');
});
