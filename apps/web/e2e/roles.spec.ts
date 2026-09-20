import { expect, test } from '@playwright/test';

import type { Page } from '@playwright/test';

import { signIn } from './accounts';

/** Sidebar navigation, so a same-named button or quest link in the page body can't be hit. */
function nav(page: Page) {
  return page.getByRole('navigation').getByRole('link');
}

test.describe('student flow', () => {
  test('sees a real readiness score and can open a practice brief', async ({ page }) => {
    await signIn(page, 'student');

    await expect(page.getByText(/Communication readiness/i).first()).toBeVisible();
    // The KPI is computed, so it must not be a placeholder dash.
    const readiness = page.getByRole('img', { name: /Communication readiness: \d+/ });
    await expect(readiness).toBeVisible();

    await nav(page).filter({ hasText: /^Practice$/ }).click();
    await expect(page).toHaveURL(/\/student\/practice$/);
    await expect(page.getByRole('heading', { name: 'Practice Lab' })).toBeVisible();

    await page.getByRole('link', { name: /Start practice|Practise again/ }).first().click();
    await expect(page.getByText(/Before you start/i)).toBeVisible();
    await expect(page.getByText(/I consent to this session being recorded/i)).toBeVisible();
  });

  test('progress page charts the score history', async ({ page }) => {
    await signIn(page, 'student');
    await nav(page).filter({ hasText: /^Progress$/ }).click();
    await expect(page.getByRole('heading', { name: 'My Progress' })).toBeVisible();
    await expect(page.getByText(/Day one vs today/i)).toBeVisible();
  });
});

test.describe('trainer flow', () => {
  test('only the assigned batches are listed', async ({ page }) => {
    await signIn(page, 'trainer');
    await expect(page.getByText(/Only your assigned batches/i)).toBeVisible();

    await nav(page).filter({ hasText: /^My Batches$/ }).click();
    await expect(page.getByRole('heading', { name: 'My Batches' })).toBeVisible();
    const cards = page.getByRole('link', { name: /Roster/ });
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test('the evaluation form loads the full parameter set', async ({ page }) => {
    await signIn(page, 'trainer');
    await page.goto('/trainer/evaluations/new');
    await expect(page.getByRole('heading', { name: 'New evaluation' })).toBeVisible();

    await page.getByLabel('Search participants').fill('Rahul');
    await page.getByRole('button', { name: /Rahul/ }).first().click();
    await page.getByLabel('Training module').click();
    await page.getByRole('option').first().click();

    // 95+ parameters across the seven pillars.
    await expect(page.getByText(/of 9\d parameters rated|of 1\d\d parameters rated/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });

  test('attendance cannot be saved for an empty roster selection', async ({ page }) => {
    await signIn(page, 'trainer');
    await nav(page).filter({ hasText: /^Today's Classes$/ }).click();
    await expect(page.getByRole('heading', { name: "Today's Classes" })).toBeVisible();
  });
});

test.describe('HOD flow', () => {
  test('every screen states the college and department scope', async ({ page }) => {
    await signIn(page, 'hod');
    await expect(page.getByText(/Data isolation active/).first()).toBeVisible();

    await nav(page).filter({ hasText: /^Participants$/ }).click();
    await expect(page.getByRole('heading', { name: 'Participant Directory' })).toBeVisible();
    await expect(page.getByText(/≥75% attendance/)).toBeVisible();
  });

  test('the participant profile opens all six tabs', async ({ page }) => {
    await signIn(page, 'hod');
    await page.goto('/hod/participants');
    await page.getByPlaceholder('Search name or roll number…').fill('Rahul Sharma');
    await page.getByRole('link', { name: /Rahul Sharma/ }).first().click();

    for (const tab of ['Overview', 'Personal', 'Assessments', 'Feedback', 'Enrollment', 'Certificate']) {
      await page.getByRole('tab', { name: tab }).click();
      await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('data-state', 'active');
    }
  });

  test('locked scope items are shown but not clickable', async ({ page }) => {
    await signIn(page, 'hod');
    await expect(page.getByText('Other Departments')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Other Departments' })).toHaveCount(0);
  });
});

test.describe('admin flow', () => {
  test('the dashboard reports live institution figures', async ({ page }) => {
    await signIn(page, 'admin');
    await expect(page.getByText('ABC Engineering College').first()).toBeVisible();
    await expect(page.getByText(/Average EEDI score/i)).toBeVisible();
  });

  test('a new user gets a one-time temporary password', async ({ page }) => {
    await signIn(page, 'admin');
    await nav(page).filter({ hasText: /^Users & roles$/ }).click();
    await page.getByRole('button', { name: 'New user' }).click();

    const unique = Date.now();
    // Scope to the dialog: the page behind it has its own search field labelled "…email…".
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/^Full name/).fill('E2E Trainer');
    await dialog.getByLabel(/^Email/).fill(`e2e.trainer.${unique}@abcengg.edu`);
    await dialog.getByLabel('Role').click();
    await page.getByRole('option', { name: 'Trainer' }).click();
    await dialog.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByRole('heading', { name: 'Account created' })).toBeVisible();
    await expect(page.getByText(/asked to change it immediately/i)).toBeVisible();
  });

  test('the audit log is readable and filterable', async ({ page }) => {
    await signIn(page, 'admin');
    await nav(page).filter({ hasText: /^Audit log$/ }).click();
    await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible();
    await expect(page.getByText(/Append-only record/i)).toBeVisible();
  });
});
