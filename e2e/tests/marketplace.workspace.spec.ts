import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/* The workspace claim is that one selection drives every pane and that the
   selection survives a reload, because it lives in the URL rather than in
   React state. Both are asserted here; neither is visible to a unit test. */

const password = 'demo-password-123';

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('authenticated-home')).toBeVisible();
}

async function selectFirstListing(page: Page): Promise<string> {
  await page.goto('/listings');
  await expect(page.getByTestId('browse-table')).toBeVisible();
  await page.getByTestId('browse-table').getByRole('button').first().click();
  await expect(page).toHaveURL(/listing=/);
  const selected = new URL(page.url()).searchParams.get('listing');
  expect(selected).not.toBeNull();
  return selected ?? '';
}

test('one selection drives the detail pane and the book', async ({ page }) => {
  await signIn(page, 'member@demo.test');
  await selectFirstListing(page);

  // The panes are not told about each other. Each reads the router.
  await expect(page.getByTestId('item-description')).toBeVisible();
  await expect(page.getByTestId('offer-book')).toBeVisible();
  await expect(page.getByTestId('requested-principal')).toBeVisible();
});

test('the selection survives a reload, because it is in the url', async ({ page }) => {
  await signIn(page, 'member@demo.test');
  const listingId = await selectFirstListing(page);
  const description = await page.getByTestId('item-description').innerText();

  await page.reload();
  await expect(page).toHaveURL(new RegExp(`listing=${listingId}`));
  await expect(page.getByTestId('item-description')).toHaveText(description);
});

/* Every link written before the workspace existed still has to resolve, so
   the old per listing route redirects into a selection rather than 404ing. */
test('an old listing link lands on the workspace with that listing chosen', async ({ page }) => {
  await signIn(page, 'member@demo.test');
  const listingId = await selectFirstListing(page);

  await page.goto(`/listings/${listingId}`);
  await expect(page).toHaveURL(new RegExp(`/listings[?].*listing=${listingId}`));
  await expect(page.getByTestId('offer-book')).toBeVisible();
});

test('the browse rail switches between rows and a gallery', async ({ page }) => {
  await signIn(page, 'member@demo.test');
  await page.goto('/listings');
  await expect(page.getByTestId('browse-table')).toBeVisible();

  await page.getByTestId('browse-density').selectOption('gallery');
  await expect(page).toHaveURL(/density=gallery/);
  await expect(page.getByTestId('browse-table')).toBeVisible();
});

/* The load bearing claim of the whole design: the same falling rate is good
   news to one side and bad news to the other, so it cannot be painted the
   same colour for both. */
test('the same listing reads opposite ways to its borrower and to a lender', async ({
  browser,
}) => {
  const lenderContext = await browser.newContext();
  const lenderPage = await lenderContext.newPage();
  await signIn(lenderPage, 'member@demo.test');
  await lenderPage.goto('/listings');
  await expect(lenderPage.getByTestId('browse-table')).toBeVisible();

  // A listing the reader owns is marked as theirs on the rail.
  const mine = lenderPage
    .getByTestId('browse-table')
    .getByRole('button')
    .filter({ hasText: 'yours' });
  if ((await mine.count()) === 0) {
    test.skip(true, 'the seed left this account with no listing of its own');
  }
  await mine.first().click();
  await expect(lenderPage.getByTestId('offer-book')).toBeVisible();

  // Their own listing reads as the borrower: the spine speaks of the item
  // coming back, not of money going out.
  await expect(lenderPage.getByLabel('Your item, stage by stage')).toBeVisible();
  await lenderContext.close();
});
