import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { photographBytes } from './support/photograph';

const apiBase = 'http://localhost:3000/api/v1';
const marketplaceBase = 'http://localhost:5273';
const password = 'a-long-enough-password';
const oneDay = 24 * 60 * 60 * 1000;

/* The pause is process wide, so it goes back off however this test ends. */
test.afterEach(async ({ request }) => {
  await request.post(`${apiBase}/auth/login`, {
    data: { email: 'ops@demo.test', password: 'demo-password-123' },
  });
  await request.post(`${apiBase}/admin/unpause`, {
    headers: { 'idempotency-key': randomUUID() },
    data: {},
  });
});

async function signInApi(request: APIRequestContext, email: string, secret: string): Promise<void> {
  const login = await request.post(`${apiBase}/auth/login`, { data: { email, password: secret } });
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

test('a pause stops new lending without trapping a borrower', async ({
  page,
  browser,
  request,
}) => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const borrowerEmail = `borrower-${stamp}@example.test`;
  const lenderEmail = `lender-${stamp}@example.test`;
  for (const email of [borrowerEmail, lenderEmail]) {
    const registered = await request.post(`${apiBase}/auth/register`, {
      data: { email, password },
    });
    expect(registered.status()).toBe(201);
  }
  const receiptId = await issueReceiptFor(request, borrowerEmail);

  // A live loan, so there is something for the borrower to repay.
  await signInApi(request, 'ops@demo.test', 'demo-password-123');
  for (const [email, minorUnits] of [
    [lenderEmail, '300000'],
    [borrowerEmail, '50000'],
  ] as const) {
    await request.post(`${apiBase}/me/deposits`, {
      headers: { 'idempotency-key': randomUUID() },
      data: { email, amount: { minorUnits, currency: 'AUD' } },
    });
  }
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
  await signInApi(request, borrowerEmail, password);
  const listing = await request.post(`${apiBase}/listings`, {
    headers: { 'idempotency-key': randomUUID() },
    data: {
      receiptId,
      requestedPrincipal: { minorUnits: '250000', currency: 'AUD' },
      maxAnnualPercentageRateBasisPoints: 2400,
      requestedDurationMs: 30 * oneDay,
      expiresAt,
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

  await page.goto('/login');
  await page.getByTestId('email-input').fill('ops@demo.test');
  await page.getByTestId('password-input').fill('demo-password-123');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('authenticated-home')).toBeVisible();

  await page.getByRole('link', { name: 'Operations' }).click();
  await expect(page.getByTestId('system-state')).toContainText('RUNNING');
  await page.getByTestId('pause-reason').fill('A ledger discrepancy is under investigation.');
  await page.getByTestId('pause-trading').click();
  await expect(page.getByTestId('system-state')).toContainText('PAUSED');

  // New lending stops.
  await signInApi(request, lenderEmail, password);
  const refused = await request.post(`${apiBase}/listings/${listingId}/offers`, {
    headers: { 'idempotency-key': randomUUID() },
    data: {
      principal: { minorUnits: '250000', currency: 'AUD' },
      annualPercentageRateBasisPoints: 1800,
      durationMs: 30 * oneDay,
      expiresAt,
    },
  });
  expect(refused.status()).toBe(422);
  expect(((await refused.json()) as { error: { code: string } }).error.code).toBe('SYSTEM_PAUSED');

  // The borrower still gets their item back. Rule S2 in the interface: a
  // pause that traps collateral is itself an attack surface.
  const borrowerContext = await browser.newContext();
  const borrowerPage = await borrowerContext.newPage();
  await borrowerPage.goto(`${marketplaceBase}/login`);
  await borrowerPage.getByTestId('email-input').fill(borrowerEmail);
  await borrowerPage.getByTestId('password-input').fill(password);
  await borrowerPage.getByTestId('login-submit').click();
  await expect(borrowerPage.getByTestId('authenticated-home')).toBeVisible();

  await borrowerPage.getByRole('link', { name: 'My loans' }).click();
  await expect(borrowerPage.getByTestId('my-loans')).toContainText('ACTIVE');
  await borrowerPage.getByRole('button', { name: 'Repay and release the item' }).click();
  await expect(borrowerPage.getByTestId('my-loans')).toContainText('REPAID');
  await borrowerContext.close();

  await page.getByTestId('resume-trading').click();
  await expect(page.getByTestId('system-state')).toContainText('RUNNING');
});
