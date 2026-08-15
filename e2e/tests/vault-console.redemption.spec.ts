import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

const apiBase = 'http://localhost:3000/api/v1';
const marketplaceBase = 'http://localhost:5273';
const password = 'a-long-enough-password';

/* Seed the receipt through the API and drive the redemption through both
   interfaces (docs/06-testing.md). */
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
        buffer: Buffer.from(`fake bytes ${randomUUID()}`),
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

async function signIn(page: Page, email: string, secret: string): Promise<void> {
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(secret);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('authenticated-home')).toBeVisible();
}

test('a borrower asks for an item back and the counter hands it over', async ({
  page,
  browser,
  request,
}) => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const borrowerEmail = `redeemer-${stamp}@example.test`;
  const registered = await request.post(`${apiBase}/auth/register`, {
    data: { email: borrowerEmail, password },
  });
  expect(registered.status()).toBe(201);
  const receiptId = await issueReceiptFor(request, borrowerEmail);

  const borrowerContext = await browser.newContext();
  const borrowerPage = await borrowerContext.newPage();
  await borrowerPage.goto(`${marketplaceBase}/login`);
  await signIn(borrowerPage, borrowerEmail, password);
  await borrowerPage.getByRole('link', { name: 'My receipts' }).click();
  await borrowerPage.getByTestId(`redeem-${receiptId}`).click();
  await expect(borrowerPage.getByTestId(`redemption-${receiptId}`)).toContainText('REQUESTED');
  // The burn is the entitlement proof, so the receipt is spent the moment
  // the request is made, before anyone visits the counter.
  await expect(borrowerPage.getByTestId('my-receipts')).toContainText('RELEASED');

  await page.goto('/login');
  await signIn(page, 'staff@demo.test', 'demo-password-123');
  await page.getByRole('link', { name: 'Releases' }).click();
  await expect(page.getByTestId('release-queue')).toContainText(receiptId);
  await page
    .getByTestId('release-queue')
    .getByRole('row', { name: new RegExp(receiptId) })
    .getByRole('link')
    .click();

  // Handover is refused until identity is verified, and the two steps stay
  // separate so a dispute can tell them apart.
  await expect(page.getByTestId('confirm-release')).toBeDisabled();
  await page.getByTestId('verify-identity').click();
  await expect(page.getByTestId('verify-identity')).toBeDisabled();

  await page.getByTestId('seal-number-broken').fill('SEAL-BROKEN-1');
  await page.getByTestId('confirm-release').click();
  await expect(page.getByTestId('release-queue')).not.toContainText(receiptId);

  await borrowerPage.reload();
  await expect(borrowerPage.getByTestId(`redemption-${receiptId}`)).toContainText('RELEASED');
  await borrowerContext.close();
});
