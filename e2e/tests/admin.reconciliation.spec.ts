import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { photographBytes } from './support/photograph';

const apiBase = 'http://localhost:3000/api/v1';

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

test('operations reconcile a vault and see the drift', async ({ page, request }) => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const borrowerEmail = `holder-${stamp}@example.test`;
  const registered = await request.post(`${apiBase}/auth/register`, {
    data: { email: borrowerEmail, password: 'a-long-enough-password' },
  });
  expect(registered.status()).toBe(201);
  const receiptId = await issueReceiptFor(request, borrowerEmail);

  await page.goto('/login');
  await page.getByTestId('email-input').fill('ops@demo.test');
  await page.getByTestId('password-input').fill('demo-password-123');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('authenticated-home')).toBeVisible();

  await page.getByRole('link', { name: 'Reconciliation' }).click();
  await expect(page.getByTestId('loan-book')).toBeVisible();
  await expect(page.getByTestId('exposure-table')).toContainText('VAULT-DEMO-1');

  // Count an id the vault has never held. The records and the floor
  // disagree, which is an incident rather than a rounding difference.
  await page.getByTestId('counted-receipts').fill('R-GHOST-ITEM');
  await page.getByTestId('run-reconciliation').click();

  await expect(page.getByTestId('reconciliation-runs')).toContainText('DRIFT');
  await expect(page.getByTestId('reconciliation-runs')).toContainText('R-GHOST-ITEM');
  await expect(page.getByTestId('reconciliation-runs')).toContainText('MISSING_FROM_RECORDS');
  // The receipt the vault really holds is missing from the count, so it is
  // drift in the other direction.
  await expect(page.getByTestId('reconciliation-runs')).toContainText(receiptId);
  await expect(page.getByTestId('reconciliation-runs')).toContainText('MISSING_FROM_COUNT');
});
