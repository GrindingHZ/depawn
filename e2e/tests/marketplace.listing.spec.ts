import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { photographBytes } from './support/photograph';

const apiBase = 'http://localhost:3000/api/v1';
const password = 'a-long-enough-password';

async function registerMember(request: APIRequestContext, email: string): Promise<void> {
  const response = await request.post(`${apiBase}/auth/register`, {
    data: { email, password },
  });
  expect(response.status()).toBe(201);
}

/* Seed through the API, assert through the UI (docs/06-testing.md): the
   receipt comes from the intake endpoints driven as staff. */
async function issueReceiptFor(request: APIRequestContext, borrowerEmail: string): Promise<void> {
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
  const sealed = await request.post(`${apiBase}/intakes/${intakeId}/seal`, {
    headers: { 'idempotency-key': randomUUID() },
    data: {},
  });
  expect(sealed.status()).toBe(201);
  const issued = await request.post(`${apiBase}/intakes/${intakeId}/issue-receipt`, {
    headers: { 'idempotency-key': randomUUID() },
    data: { insurancePolicyReference: 'POL-E2E' },
  });
  expect(issued.status()).toBe(201);
  await request.post(`${apiBase}/auth/logout`);
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

test('a receipt becomes a listing and takes a funded offer', async ({ page, browser, request }) => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const borrowerEmail = `borrower-${stamp}@example.test`;
  const lenderEmail = `lender-${stamp}@example.test`;
  await registerMember(request, borrowerEmail);
  await registerMember(request, lenderEmail);
  await issueReceiptFor(request, borrowerEmail);
  await fundAccount(request, lenderEmail, '300000');

  await page.goto('/login');
  await page.getByTestId('email-input').fill(borrowerEmail);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('authenticated-home')).toBeVisible();

  await page.getByRole('link', { name: 'My receipts' }).click();
  await page.getByRole('button', { name: 'List' }).click();
  await page.getByTestId('list-principal').fill('2500.00');
  await page.getByTestId('list-submit').click();
  await expect(page.getByTestId('my-listings')).toContainText('Taking offers');
  await page.getByRole('link', { name: 'My listings' }).click();
  const listingId = (
    await page.getByTestId('my-listings').getByRole('link').first().innerText()
  ).trim();

  const lenderContext = await browser.newContext();
  const lenderPage = await lenderContext.newPage();
  await lenderPage.goto('/login');
  await lenderPage.getByTestId('email-input').fill(lenderEmail);
  await lenderPage.getByTestId('password-input').fill(password);
  await lenderPage.getByTestId('login-submit').click();
  await expect(lenderPage.getByTestId('authenticated-home')).toBeVisible();

  // Browse shows every live listing, including ones other specs publish at
  // the same time, so the lender opens the listing under test by id rather
  // than taking whatever happens to be on top.
  await lenderPage.getByRole('link', { name: 'Browse' }).click();
  /* The row is the item now, not the identifier, so Browse is checked by the
     row's own handle rather than by looking for a ULID in the text. */
  await expect(lenderPage.getByTestId(`listing-${listingId}`)).toBeVisible();
  await lenderPage.goto(`/listings/${listingId}`);

  await expect(lenderPage.getByTestId('max-principal')).toHaveText('AUD 3,000.00');
  await lenderPage.getByTestId('offer-rate').fill('18.00');
  await lenderPage.getByTestId('offer-submit').click();
  await expect(lenderPage.getByTestId('offer-book')).toContainText('18.00%');

  await lenderPage.getByRole('link', { name: 'Wallet' }).click();
  await expect(lenderPage.getByTestId('held-balance')).toHaveText('AUD 2,500.00');
  await lenderContext.close();
});

test('the offer form blocks a principal above the ceiling', async ({ page, request }) => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const borrowerEmail = `borrower-${stamp}@example.test`;
  const lenderEmail = `lender-${stamp}@example.test`;
  await registerMember(request, borrowerEmail);
  await registerMember(request, lenderEmail);
  await issueReceiptFor(request, borrowerEmail);
  await fundAccount(request, lenderEmail, '400000');

  await page.goto('/login');
  await page.getByTestId('email-input').fill(borrowerEmail);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('login-submit').click();
  await page.getByRole('link', { name: 'My receipts' }).click();
  await page.getByRole('button', { name: 'List' }).click();
  await page.getByTestId('list-principal').fill('2500.00');
  await page.getByTestId('list-submit').click();
  await expect(page.getByTestId('my-listings')).toContainText('Taking offers');
  const ceilingListingId = (
    await page.getByTestId('my-listings').getByRole('link').first().innerText()
  ).trim();
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.waitForURL('**/login');
  // A full reload gives the login form a clean mount; the logout redirect
  // and the home redirect can otherwise race the fills.
  await page.goto('/login');

  await page.getByTestId('email-input').fill(lenderEmail);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('authenticated-home')).toBeVisible();
  await page.goto(`/listings/${ceilingListingId}`);

  await page.getByTestId('offer-principal').fill('3000.01');
  await expect(page.getByTestId('offer-submit')).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('Above the lending ceiling');
});
