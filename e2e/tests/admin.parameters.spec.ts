import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const password = 'demo-password-123';

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('authenticated-home')).toBeVisible();
}

test('an operator edits the parameters and sees the version in the history', async ({ page }) => {
  await signIn(page, 'ops@demo.test');
  await page.goto('/parameters');

  const originationFee = page.getByTestId('origination-fee');
  await expect(originationFee).toHaveText('200 bps');
  const before = await originationFee.textContent();

  // Dated a minute ago so it is already in force when the page reloads.
  const effectiveAt = new Date(Date.now() - 60_000).toISOString().slice(0, 16);
  await page.getByTestId('edit-origination-fee').fill('250');
  await page.getByTestId('edit-liquidation-fee').fill('300');
  await page.getByTestId('edit-effective-at').fill(effectiveAt);
  await page.getByTestId('save-parameters').click();

  await expect(page.getByTestId('origination-fee')).toHaveText('250 bps');
  await expect(page.getByTestId('liquidation-fee')).toHaveText('300 bps');
  await expect(page.getByTestId('parameter-history')).toContainText('250 bps');

  // Put the demo defaults back, since the parameters outlive this spec.
  await page.getByTestId('edit-origination-fee').fill('200');
  await page.getByTestId('edit-liquidation-fee').fill('200');
  await page
    .getByTestId('edit-effective-at')
    .fill(new Date(Date.now() - 60_000).toISOString().slice(0, 16));
  await page.getByTestId('save-parameters').click();
  await expect(page.getByTestId('origination-fee')).toHaveText(before ?? '200 bps');
});

test('a fee outside the basis point range never reaches the api', async ({ page }) => {
  await signIn(page, 'ops@demo.test');
  await page.goto('/parameters');

  await page.getByTestId('edit-origination-fee').fill('20000');
  await page.getByTestId('edit-liquidation-fee').fill('200');
  await page.getByTestId('edit-effective-at').fill(new Date().toISOString().slice(0, 16));
  await page.getByTestId('save-parameters').click();

  await expect(page.getByRole('alert')).toContainText('whole basis points');
  await expect(page.getByTestId('origination-fee')).toHaveText('200 bps');
});

test('the dead letter table is empty on a healthy queue', async ({ page }) => {
  await signIn(page, 'ops@demo.test');
  await page.goto('/parameters');
  await expect(page.getByTestId('dead-letters')).toContainText('Nothing has given up');
});

/* A member can sign in to the admin app and gets told, on every screen, that
   the tools are not theirs. The api refuses them too, which is the half that
   matters: the screen is a courtesy, the status code is the rule. */
test('a member cannot reach the parameters', async ({ page, request }) => {
  await page.goto('/login');
  await page.getByTestId('email-input').fill('member@demo.test');
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('access-denied')).toBeVisible();

  await page.goto('/parameters');
  await expect(page.getByTestId('access-denied')).toBeVisible();
  await expect(page.getByTestId('current-parameters')).toHaveCount(0);

  await request.post('http://localhost:3000/api/v1/auth/login', {
    data: { email: 'member@demo.test', password },
  });
  const refused = await request.get('http://localhost:3000/api/v1/admin/protocol-parameters');
  expect(refused.status()).toBe(403);
});
