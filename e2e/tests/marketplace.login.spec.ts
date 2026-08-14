import { expect, test } from '@playwright/test';

const apiBase = 'http://localhost:3000/api/v1';
const password = 'a-long-enough-password';

test('a member logs in and sees the authenticated home', async ({ page, request }) => {
  const email = `member-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.test`;
  const registered = await request.post(`${apiBase}/auth/register`, {
    data: { email, password },
  });
  expect(registered.status()).toBe(201);

  await page.goto('/login');
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('login-submit').click();

  await expect(page.getByTestId('authenticated-home')).toBeVisible();
  await expect(page.getByTestId('account-email')).toHaveText(email);
});

test('a wrong password keeps the member on the login screen with an alert', async ({
  page,
  request,
}) => {
  const email = `member-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.test`;
  await request.post(`${apiBase}/auth/register`, { data: { email, password } });

  await page.goto('/login');
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill('wrong-password-entirely');
  await page.getByTestId('login-submit').click();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('authenticated-home')).not.toBeVisible();
});

test('logging out returns to the login screen', async ({ page, request }) => {
  const email = `member-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.test`;
  await request.post(`${apiBase}/auth/register`, { data: { email, password } });

  await page.goto('/login');
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('authenticated-home')).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByTestId('login-submit')).toBeVisible();
});
