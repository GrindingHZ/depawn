import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { APIRequestContext, Browser, Page } from '@playwright/test';

const apiBase = 'http://localhost:3000/api/v1';
const password = 'a-long-enough-password';

async function registerMember(request: APIRequestContext, email: string): Promise<void> {
  const response = await request.post(`${apiBase}/auth/register`, { data: { email, password } });
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

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('authenticated-home')).toBeVisible();
}

/* Other specs publish listings against the same database, so the lenders go
   straight to the listing under test rather than to the top of the browse
   list. */
async function offerAs(
  browser: Browser,
  email: string,
  listingId: string,
  rate: string,
): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, email);
  await page.goto(`/listings/${listingId}`);
  await page.getByTestId('offer-rate').fill(rate);
  await page.getByTestId('offer-submit').click();
  await expect(page.getByTestId('offer-book')).toContainText(`${rate}% p.a.`);
  return page;
}

test('a borrower accepts an offer and both sides see the loan', async ({
  page,
  browser,
  request,
}) => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const borrowerEmail = `borrower-${stamp}@example.test`;
  const winnerEmail = `winner-${stamp}@example.test`;
  const loserEmail = `loser-${stamp}@example.test`;
  await registerMember(request, borrowerEmail);
  await registerMember(request, winnerEmail);
  await registerMember(request, loserEmail);
  await issueReceiptFor(request, borrowerEmail);
  await fundAccount(request, winnerEmail, '300000');
  await fundAccount(request, loserEmail, '300000');

  await signIn(page, borrowerEmail);
  await page.getByRole('link', { name: 'My receipts' }).click();
  await page.getByRole('button', { name: 'List' }).click();
  await page.getByTestId('list-principal').fill('2500.00');
  await page.getByTestId('list-submit').click();
  await expect(page.getByTestId('my-listings')).toContainText('ACTIVE');

  await page.getByRole('link', { name: 'My listings' }).click();
  const listingLink = page.getByTestId('my-listings').getByRole('link').first();
  const listingId = (await listingLink.innerText()).trim();

  const winnerPage = await offerAs(browser, winnerEmail, listingId, '18.00');
  const loserPage = await offerAs(browser, loserEmail, listingId, '24.00');

  await page.goto(`/listings/${listingId}`);
  // The book is ranked by total borrower cost, so the cheapest offer leads.
  await expect(page.getByTestId('offer-book')).toContainText('18.00% p.a.');
  await expect(page.getByTestId('offer-submit')).toHaveCount(0);
  // A lender never sees the control, so the offer book cannot be used to
  // accept on someone else's behalf.
  await expect(winnerPage.getByRole('button', { name: 'Accept' })).toHaveCount(0);
  await page.getByTestId('offer-book').getByRole('button', { name: 'Accept' }).first().click();

  await expect(page.getByTestId('my-loans')).toContainText('ACTIVE');
  await expect(page.getByTestId('my-loans')).toContainText('AUD 2,500.00');
  await expect(page.getByTestId('my-loans')).toContainText('18.00% p.a.');

  // A full load rather than a client side hop, because this page has been
  // sitting on the listing while another context originated the loan.
  await winnerPage.goto('/lend/loans');
  await expect(winnerPage.getByTestId('funded-loans')).toContainText('ACTIVE');
  await expect(winnerPage.getByTestId('funded-loans')).toContainText('AUD 2,500.00');

  // The losing hold is committed until its lender pulls it back (rule M8).
  await loserPage.getByRole('link', { name: 'Wallet' }).click();
  await expect(loserPage.getByTestId('reclaim-banner')).toBeVisible();
  await expect(loserPage.getByTestId('held-balance')).toHaveText('AUD 2,500.00');
  await loserPage.getByRole('link', { name: 'Reclaim your funds' }).click();
  await loserPage.getByRole('button', { name: 'Reclaim funds' }).first().click();
  await loserPage.getByRole('link', { name: 'Wallet' }).click();
  await expect(loserPage.getByTestId('available-balance')).toHaveText('AUD 3,000.00');

  await winnerPage.context().close();
  await loserPage.context().close();
});
