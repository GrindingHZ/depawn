import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
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

async function issueReceiptFor(request: APIRequestContext, borrowerEmail: string): Promise<string> {
  await request.post(`${apiBase}/auth/login`, {
    data: { email: 'staff@demo.test', password: 'demo-password-123' },
  });
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

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('authenticated-home')).toBeVisible();
}

test('a lender takes the collateral once grace has run out', async ({ page, request }) => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const borrowerEmail = `borrower-${stamp}@example.test`;
  const lenderEmail = `lender-${stamp}@example.test`;
  await registerMember(request, borrowerEmail);
  await registerMember(request, lenderEmail);
  const receiptId = await issueReceiptFor(request, borrowerEmail);
  await fundAccount(request, lenderEmail, '300000');
  await originateLoan(request, borrowerEmail, lenderEmail, receiptId);

  await signIn(page, lenderEmail);
  await page.getByRole('link', { name: 'Funded loans' }).click();
  await expect(page.getByTestId('funded-loans')).toContainText('Running');
  // Inside grace the server refuses, and the lender is told why rather than
  // left with a button that does nothing.
  await page.getByRole('button', { name: 'Mark defaulted' }).click();
  await expect(page.getByRole('alert')).toContainText('still inside the grace period');
  await expect(page.getByTestId('funded-loans')).toContainText('Running');

  // Thirty days of term, seven of grace, and a day to be past it.
  const advanced = await request.post(`${apiBase}/test/clock/advance`, {
    data: { milliseconds: 38 * oneDay },
  });
  expect(advanced.status()).toBe(201);

  await signIn(page, lenderEmail);
  await page.getByRole('link', { name: 'Funded loans' }).click();
  await page.getByRole('button', { name: 'Mark defaulted' }).click();
  await expect(page.getByTestId('funded-loans')).toContainText('Defaulted');

  await page.getByRole('button', { name: 'Claim the item' }).click();
  // The item is now the lender's, held in the vault, ready to redeem.
  await page.getByRole('link', { name: 'My receipts' }).click();
  await expect(page.getByTestId('my-receipts')).toContainText(receiptId);
  await expect(page.getByTestId('my-receipts')).toContainText('In the vault');
});
