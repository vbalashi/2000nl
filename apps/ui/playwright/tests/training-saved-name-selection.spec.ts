import { expect, test } from '@playwright/test';
import { setupAuthenticatedTrainingAttributionPage } from '../support/trainingAttributionHarness';

test('saved training names select without launching, and edit remains independent', async ({ page }) => {
  await setupAuthenticatedTrainingAttributionPage(page, 0, {
    devTestLogin: false,
    visualProfile: 'answer',
    settingsOverrides: { preferences: { onboardingLanguage: 'en' } },
  });
  const draft = { family: 'meaning', scenarioId: 'understanding', modes: ['word-to-definition'], cardFilter: 'review', listValue: 'curated:list-attribution', materialMode: 'collection', newReviewRatio: 2, dateWindow: 'all', sourceValue: 'all', sessionSize: 5 };
  const trainings = ['First practice', 'Second practice'].map((name, index) => ({ id: `saved-${index}`, name, languageCode: 'nl', draft }));
  await page.route('**/api/training/setups', route => route.fulfill({ json: { revision: 1, document: { schemaVersion: 1, mainTrainingId: 'saved-0', trainings } } }));
  await page.route('**/api/training/availability', route => route.fulfill({ json: { dueToday: 1, totalReviews: 5, newCards: 0, studyDay: '2026-10-03', timezone: 'UTC', asOf: new Date().toISOString() } }));
  let starts = 0;
  await page.route('**/rpc/start_training_session', route => {
    starts++;
    return route.fulfill({ json: { sessionId: 'training-session-fixture', plannedNew: 0, plannedReview: 1, plannedPractice: 0, plannedTotal: 1, plannedAt: new Date().toISOString() } });
  });
  await page.reload();

  const hero = page.getByRole('region', { name: 'Main training' });
  const saved = page.getByRole('region', { name: 'Saved Trainings' });
  const first = saved.getByRole('button', { name: 'First practice', exact: true });
  const second = saved.getByRole('button', { name: 'Second practice', exact: true });
  await expect(hero.getByRole('heading', { name: 'First practice' })).toBeVisible();
  await saved.getByRole('button', { name: 'Edit Second practice' }).click();
  await expect(page.getByRole('heading', { name: 'Session builder' })).toBeVisible();
  expect(starts).toBe(0);
  await page.getByRole('button', { name: 'Back to Training' }).click();
  await expect(hero.getByRole('heading', { name: 'First practice' })).toBeVisible();
  await expect(first).toHaveAttribute('aria-pressed', 'true');

  await second.click();
  await expect(hero.getByRole('heading', { name: 'Second practice' })).toBeVisible();
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  await first.focus();
  await page.keyboard.press('Enter');
  await expect(hero.getByRole('heading', { name: 'First practice' })).toBeVisible();
  await second.focus();
  await page.keyboard.press('Space');
  await expect(hero.getByRole('heading', { name: 'Second practice' })).toBeVisible();
  expect(starts).toBe(0);
});
