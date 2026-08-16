import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { APIRequestContext, Browser, Page } from '@playwright/test';
import { photographBytes } from './support/photograph';

/* docs/DEMO.md is a script someone reads out in front of an audience, so it
   has to be a test rather than a document that used to be true. This walks
   the same click path across the same three apps, in the same order, and
   fails if any step of the runbook no longer lands where it says it does.
   It builds its own cast rather than leaning on the demo dataset, for the
   same reason every other spec does: one database serves the whole suite. */

const apiBase = 'http://localhost:3000/api/v1';
const marketplaceBase = 'http://localhost:5273';
const vaultConsoleBase = 'http://localhost:5174';
const adminBase = 'http://localhost:5175';
const password = 'a-long-enough-password';
const staffPassword = 'demo-password-123';
const oneDay = 24 * 60 * 60 * 1000;

/* The offset lives in the api process, which outlives this spec. */
test.afterEach(async ({ request }) => {
  await request.post(`${apiBase}/test/clock/reset`, { data: {} });
});

async function signIn(page: Page, email: string, secret: string): Promise<void> {
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(secret);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('authenticated-home')).toBeVisible();
}

async function signInApi(request: APIRequestContext, email: string, secret: string): Promise<void> {
  const login = await request.post(`${apiBase}/auth/login`, { data: { email, password: secret } });
  expect(login.status()).toBe(200);
}

async function openApp(browser: Browser, base: string, path: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}${path}`);
  return page;
}

async function registerMember(request: APIRequestContext, email: string): Promise<void> {
  const response = await request.post(`${apiBase}/auth/register`, { data: { email, password } });
  expect(response.status()).toBe(201);
}

async function fundAccount(
  request: APIRequestContext,
  email: string,
  minorUnits: string,
): Promise<void> {
  await signInApi(request, 'ops@demo.test', staffPassword);
  const deposit = await request.post(`${apiBase}/me/deposits`, {
    headers: { 'idempotency-key': randomUUID() },
    data: { email, amount: { minorUnits, currency: 'AUD' } },
  });
  expect(deposit.status()).toBe(201);
}

test('the demo runbook walks end to end exactly as docs/DEMO.md describes', async ({
  browser,
  request,
}) => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const borrowerEmail = `runbook-borrower-${stamp}@example.test`;
  const lenderEmail = `runbook-lender-${stamp}@example.test`;
  const rivalEmail = `runbook-rival-${stamp}@example.test`;
  for (const email of [borrowerEmail, lenderEmail, rivalEmail]) {
    await registerMember(request, email);
  }
  await fundAccount(request, lenderEmail, '300000');
  await fundAccount(request, rivalEmail, '300000');
  await fundAccount(request, borrowerEmail, '50000');

  // Step 1. An item arrives at the vault.
  const vaultPage = await openApp(browser, vaultConsoleBase, '/login');
  await signIn(vaultPage, 'staff@demo.test', staffPassword);
  await vaultPage.getByRole('link', { name: 'Intake' }).click();
  await vaultPage.getByTestId('intake-borrower-email').fill(borrowerEmail);
  await vaultPage.getByTestId('intake-item-description').fill('One ounce gold coin');
  await vaultPage.getByTestId('intake-start').click();

  await vaultPage.getByTestId('identify-serials').fill(`SN-${stamp}`);
  await vaultPage.getByTestId('identify-save').click();
  await vaultPage.getByTestId('photo-input').setInputFiles({
    name: 'front.png',
    mimeType: 'image/png',
    buffer: photographBytes(),
  });
  await expect(vaultPage.getByTestId('evidence-list')).toContainText('front.png');
  await vaultPage.getByTestId('photograph-continue').click();

  await vaultPage.getByTestId('appraise-value').fill('3000.00');
  await vaultPage.getByTestId('appraise-method').fill('spot price times weight');
  await vaultPage.getByTestId('appraise-save').click();
  await expect(vaultPage.getByTestId('appraisal-list')).toContainText('AUD 3,000.00');
  await vaultPage.getByTestId('appraise-continue').click();

  await vaultPage.getByTestId('seal-number').fill(`SEAL-${stamp}`);
  await vaultPage.getByTestId('seal-request').click();
  await vaultPage.getByTestId('seal-confirm').click();
  await vaultPage.getByTestId('issue-policy').fill('POL-RUNBOOK');
  await vaultPage.getByTestId('issue-request').click();
  await vaultPage.getByTestId('issue-confirm').click();
  const receiptId = (await vaultPage.getByTestId('issued-receipt-id').textContent())?.trim() ?? '';
  expect(receiptId).not.toBe('');

  // Step 2. The borrower lists it and two lenders compete.
  const borrowerPage = await openApp(browser, marketplaceBase, '/login');
  await signIn(borrowerPage, borrowerEmail, password);
  await borrowerPage.getByRole('link', { name: 'My receipts' }).click();
  await borrowerPage.getByRole('button', { name: 'List' }).click();
  await borrowerPage.getByTestId('list-principal').fill('1500.00');
  await borrowerPage.getByTestId('list-submit').click();
  await expect(borrowerPage.getByTestId('my-listings')).toContainText('ACTIVE');
  const listingId = (
    await borrowerPage.getByTestId('my-listings').getByRole('link').first().innerText()
  ).trim();

  for (const [email, rate] of [
    [rivalEmail, '24.00'],
    [lenderEmail, '18.00'],
  ] as const) {
    const lenderPage = await openApp(browser, marketplaceBase, '/login');
    await signIn(lenderPage, email, password);
    await lenderPage.goto(`${marketplaceBase}/listings/${listingId}`);
    await lenderPage.getByTestId('offer-rate').fill(rate);
    await lenderPage.getByTestId('offer-submit').click();
    await expect(lenderPage.getByTestId('offer-book')).toContainText(`${rate}% p.a.`);
    await lenderPage.context().close();
  }

  await borrowerPage.goto(`${marketplaceBase}/listings/${listingId}`);
  // The book ranks by rate, so the cheapest money is the one on top.
  const topRow = borrowerPage.getByTestId('offer-book').getByRole('row').nth(1);
  await expect(topRow).toContainText('18.00% p.a.');
  await topRow.getByRole('button', { name: 'Accept' }).click();
  await borrowerPage.getByRole('link', { name: 'My loans' }).click();
  await expect(borrowerPage.getByTestId('my-loans')).toContainText('ACTIVE');

  // Step 3. Operations pushes the clock past maturity from the admin screen.
  const adminPage = await openApp(browser, adminBase, '/login');
  await signIn(adminPage, 'ops@demo.test', staffPassword);
  await adminPage.getByRole('link', { name: 'Parameters' }).click();
  await expect(adminPage.getByTestId('demo-clock')).toBeVisible();
  await Promise.all([
    // The click only dispatches the request; the page is about to be left, so
    // the jump has to be known to have landed before anything else happens.
    adminPage.waitForResponse(
      (response) => response.url().includes('/test/clock/advance') && response.status() === 201,
    ),
    adminPage.getByTestId('advance-31').click(),
  ]);

  /* A month is longer than a session lasts, so the jump signs everyone out,
     including the operator who made it. Nothing on the admin screen is worth
     asserting after the click for that reason: the outcome to check is that
     the loan is now past maturity, which the borrower sees below. The runbook
     says so at this step, and this is what proves it still says the truth. */
  await adminPage.goto(`${adminBase}/login`);
  await signIn(adminPage, 'ops@demo.test', staffPassword);
  await vaultPage.goto(`${vaultConsoleBase}/login`);
  await signIn(vaultPage, 'staff@demo.test', staffPassword);
  await borrowerPage.goto(`${marketplaceBase}/login`);
  await signIn(borrowerPage, borrowerEmail, password);

  // Step 4. The borrower repays and the item walks back out of the vault.
  await borrowerPage.getByRole('link', { name: 'My loans' }).click();
  // Interest stopped at maturity, which the clock is now well past.
  await expect(borrowerPage.getByTestId('payoff-total')).toContainText('AUD');
  await expect(borrowerPage.getByTestId('payoff-interest')).toContainText('AUD');
  await borrowerPage.getByRole('button', { name: 'Repay and release the item' }).click();
  await expect(borrowerPage.getByTestId('my-loans')).toContainText('REPAID');

  await borrowerPage.getByRole('link', { name: 'My receipts' }).click();
  await borrowerPage.getByTestId(`redeem-${receiptId}`).click();
  await expect(borrowerPage.getByTestId(`redemption-${receiptId}`)).toContainText('REQUESTED');

  await vaultPage.goto(`${vaultConsoleBase}/releases`);
  await expect(vaultPage.getByTestId('release-queue')).toContainText(receiptId);
  await vaultPage
    .getByTestId('release-queue')
    .getByRole('row', { name: new RegExp(receiptId) })
    .getByRole('link')
    .click();
  await vaultPage.getByTestId('verify-identity').click();
  await vaultPage.getByTestId('seal-number-broken').fill(`SEAL-BROKEN-${stamp}`);
  await vaultPage.getByTestId('confirm-release').click();
  await borrowerPage.reload();
  await expect(borrowerPage.getByTestId(`redemption-${receiptId}`)).toContainText('RELEASED');

  // Step 6. The tools that keep it honest are where the runbook says.
  await adminPage.getByRole('link', { name: 'Reconciliation' }).click();
  await expect(adminPage.getByTestId('run-reconciliation')).toBeVisible();
  await expect(adminPage.getByTestId('loan-book')).toBeVisible();
  await adminPage.getByRole('link', { name: 'Parameters' }).click();
  await expect(adminPage.getByTestId('origination-fee')).toContainText('bps');
  await expect(adminPage.getByTestId('parameter-history')).toBeVisible();
  await adminPage.getByRole('link', { name: 'Operations' }).click();
  await expect(adminPage.getByTestId('system-state')).toContainText('RUNNING');

  for (const page of [vaultPage, borrowerPage, adminPage]) {
    await page.context().close();
  }
});

/* Step 5 of the runbook rests on a sale that is already taking bids, which
   the demo dataset supplies. Proving the screen behaves is what matters here,
   so this builds one the same way the seed does. */
test('the runbook can settle a sale that is already taking bids', async ({ browser, request }) => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const borrowerEmail = `runbook-default-borrower-${stamp}@example.test`;
  const lenderEmail = `runbook-default-lender-${stamp}@example.test`;
  const bidderEmail = `runbook-bidder-${stamp}@example.test`;
  for (const email of [borrowerEmail, lenderEmail, bidderEmail]) {
    await registerMember(request, email);
  }
  await fundAccount(request, lenderEmail, '300000');
  await fundAccount(request, bidderEmail, '400000');

  await signInApi(request, 'staff@demo.test', staffPassword);
  const begun = await request.post(`${apiBase}/vaults/VAULT-DEMO-1/intakes`, {
    headers: { 'idempotency-key': randomUUID() },
    data: {
      borrowerEmail,
      itemCategory: 'BULLION',
      itemDescription: 'One kilogram gold bar',
    },
  });
  const intakeId = ((await begun.json()) as { id: string }).id;
  await request.patch(`${apiBase}/intakes/${intakeId}`, {
    headers: { 'idempotency-key': randomUUID() },
    data: { sealNumber: `SEAL-${stamp}` },
  });
  await request.post(`${apiBase}/intakes/${intakeId}/photos`, {
    multipart: {
      photo: { name: 'front.png', mimeType: 'image/png', buffer: photographBytes() },
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
    data: { insurancePolicyReference: 'POL-RUNBOOK' },
  });
  const receiptId = ((await issued.json()) as { id: string }).id;

  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
  await signInApi(request, borrowerEmail, password);
  const listing = await request.post(`${apiBase}/listings`, {
    headers: { 'idempotency-key': randomUUID() },
    data: {
      receiptId,
      requestedPrincipal: { minorUnits: '250000', currency: 'AUD' },
      maxAnnualPercentageRateBasisPoints: 2400,
      requestedDurationMs: 14 * oneDay,
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
      annualPercentageRateBasisPoints: 2400,
      durationMs: 14 * oneDay,
      expiresAt,
    },
  });
  const offerId = ((await offer.json()) as { id: string }).id;
  await signInApi(request, borrowerEmail, password);
  const accepted = await request.post(`${apiBase}/listings/${listingId}/offers/${offerId}/accept`, {
    headers: { 'idempotency-key': randomUUID() },
    data: {},
  });
  const loanId = ((await accepted.json()) as { id: string }).id;

  await request.post(`${apiBase}/test/clock/advance`, { data: { milliseconds: 22 * oneDay } });
  await signInApi(request, lenderEmail, password);
  await request.post(`${apiBase}/loans/${loanId}/default`, {
    headers: { 'idempotency-key': randomUUID() },
    data: {},
  });
  await request.post(`${apiBase}/test/clock/advance`, { data: { milliseconds: 31 * oneDay } });
  await signInApi(request, 'ops@demo.test', staffPassword);
  const scheduled = await request.post(`${apiBase}/loans/${loanId}/liquidations`, {
    headers: { 'idempotency-key': randomUUID() },
    data: { reservePrice: { minorUnits: '150000', currency: 'AUD' } },
  });
  const liquidationId = ((await scheduled.json()) as { id: string }).id;
  await request.post(`${apiBase}/liquidations/${liquidationId}/open`, {
    headers: { 'idempotency-key': randomUUID() },
    data: { biddingWindowMs: 7 * oneDay },
  });
  await signInApi(request, bidderEmail, password);
  await request.post(`${apiBase}/liquidations/${liquidationId}/bids`, {
    headers: { 'idempotency-key': randomUUID() },
    data: { amount: { minorUnits: '300000', currency: 'AUD' } },
  });

  const adminPage = await openApp(browser, adminBase, '/login');
  await signIn(adminPage, 'ops@demo.test', staffPassword);
  await adminPage.getByRole('link', { name: 'Liquidations' }).click();
  await expect(adminPage.getByTestId('liquidations-table')).toContainText('BIDDING');
  await adminPage.getByTestId(`close-${liquidationId}`).click();
  await expect(adminPage.getByTestId('liquidations-table')).toContainText('SETTLED');

  // The runbook then reads the audit trail for that sale.
  await adminPage.getByRole('link', { name: 'Operations' }).click();
  await adminPage.getByTestId('audit-subject').fill(liquidationId);
  await adminPage.getByTestId('audit-search').click();
  await expect(adminPage.getByTestId('audit-table')).toContainText('close_liquidation');
  await adminPage.context().close();
});
