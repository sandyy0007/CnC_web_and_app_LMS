import { expect, test } from '@playwright/test';

import { ACCOUNTS, signIn, signOut } from './accounts';

test.describe('authentication', () => {
  test('the public home page shows live figures, not marketing constants', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', {
        name: /Learn, Practise and Build the Skills Required for Your Career/i,
      }),
    ).toBeVisible();
    await expect(page.getByText(/Counted live from the platform database/i)).toBeVisible();
  });

  test('a wrong password is refused with one generic message', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email or institution ID').fill(ACCOUNTS.student.identifier);
    await page.getByLabel('Password', { exact: true }).fill('definitely-not-it');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Next's route announcer is also role="alert", so target the form's own message.
    const alert = page.getByRole('alert').filter({ hasText: /incorrect/i });
    await expect(alert).toContainText(/email\/ID or password is incorrect/i);
    // The message must not reveal whether the account exists.
    await expect(alert).not.toContainText(/no such user|not found|unregistered/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test('each role lands in its own portal', async ({ page }) => {
    for (const role of ['student', 'trainer', 'hod', 'admin'] as const) {
      await signIn(page, role);
      await signOut(page);
    }
  });

  test('a signed-out visitor is bounced off a portal route', async ({ page }) => {
    await page.goto('/hod/dashboard');
    await expect(page).toHaveURL(/\/login\?next=/, { timeout: 30_000 });
  });

  test('a student cannot open the HOD portal', async ({ page }) => {
    await signIn(page, 'student');
    await page.goto('/hod/participants');
    // Frontend redirects; the API would refuse it anyway.
    await expect(page).toHaveURL(/\/student\/dashboard/, { timeout: 30_000 });
  });

  test('the session survives a reload without re-entering a password', async ({ page }) => {
    await signIn(page, 'student');
    await page.reload();
    await expect(page).toHaveURL(/\/student\/dashboard/);
    await expect(page.getByRole('heading', { name: /Hello, Alex/i })).toBeVisible();
  });
});
