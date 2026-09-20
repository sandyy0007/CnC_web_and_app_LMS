import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** The seeded demo accounts. `apps/api/app/seed/run.py` is the source of truth. */
export const ACCOUNTS = {
  student: { identifier: 'alex.johnson@eedi.com', home: '/student/dashboard' },
  trainer: { identifier: 'r.bose@abcengg.edu', home: '/trainer/dashboard' },
  hod: { identifier: 'priya.kulkarni@abcengg.edu', home: '/hod/dashboard' },
  admin: { identifier: 'rishabh.kumawat@abcengg.edu', home: '/admin/dashboard' },
} as const;

export const PASSWORD = 'Eedi@2026';

export async function signIn(page: Page, role: keyof typeof ACCOUNTS) {
  const account = ACCOUNTS[role];
  await page.goto('/login');
  await page.getByLabel('Email or institution ID').fill(account.identifier);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`${account.home}$`), { timeout: 30_000 });
}

/** Sign out through the profile menu, the way a user would. */
export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
}
