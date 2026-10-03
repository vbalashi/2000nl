import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";
import { multiSenseBankGroup } from "../../tests/platformV2LibraryFixture";
import { shiftDate } from "../../lib/training/activity/model";

test.skip(process.env.NEXT_PUBLIC_SHARED_ARTICLE_PRESENTATION_V1 !== "true", "Approved UI required");

test("@pilot Library sheet preserves mouse and touch heights in the real navigation", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 610, height: 900 });
  await setupAuthenticatedTrainingAttributionPage(page, 0, { visualProfile: "answer", devTestLogin: process.env.TRAINING_RELIABILITY_DEV_LOGIN === "true" });
  const respond = async (route: import('@playwright/test').Route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({ json: {
      contractVersion: "platform-lookup-v2", query: body.query ?? "bank",
      request: { contentLanguageCode: body.contentLanguageCode, translationTargetLanguageCode: body.translationTargetLanguageCode, cardTypeId: body.cardTypeId, intent: body.intent },
      groups: [multiSenseBankGroup], page: { selectedTierComplete: true, nextGroupCursor: null },
      librarySearch: { totalGroups: 1, matchingEntryIds: multiSenseBankGroup.entries.flatMap(entry => "entryId" in entry ? [entry.entryId] : []) },
    } });
  };
  await page.route("**/api/library/search", respond);
  await page.route("**/api/platform/v2/lookup", respond);
  await page.locator('[data-app-mobile-navigation="tabs"]').getByRole('button').nth(1).click();
  await page.locator('[data-testid^="library-headword-group-"]').first().click();
  const handle = page.getByRole('button', { name: /Expand word card|Развернуть карточку слова|Woordkaart uitklappen/i });
  await expect(handle).toBeVisible();
  const sheet = page.locator('section[data-dragging]');
  await expect(sheet.getByTestId('library-sense-card-group')).toBeVisible();
  await page.waitForTimeout(350); // Allow initial entrance animation before measuring pointer coordinates.
  const height = () => sheet.evaluate(element => element.getBoundingClientRect().height);
  const initial = await height();
  let box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 80, box.y + 14); await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y - 109, { steps: 8 }); await page.mouse.up();
  await expect.poll(height).toBeCloseTo(initial + 123, 0);
  const mouse = await height();
  box = (await handle.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 80, y: box.y + 14 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + 80, y: box.y - 53 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(height).toBeCloseTo(mouse + 67, 0);
  const touch = await height();
  await handle.press('Home'); await expect.poll(height).toBeCloseTo(initial, 0);
  await handle.click(); await expect(sheet.locator('button[aria-expanded="true"]').first()).toBeVisible();
  await testInfo.attach('pointer-evidence.json', { body: JSON.stringify({ source: 'real Library UI, mocked transport', initial, mouse, touch }), contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath('expanded-library.png') });
});

test("@pilot Statistics retains loaded Activity and material data across destination changes", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 610, height: 900 });
  await setupAuthenticatedTrainingAttributionPage(page, 0, { visualProfile: "answer", devTestLogin: process.env.TRAINING_RELIABILITY_DEV_LOGIN === "true" });
  let activityReads = 0; let materialReads = 0;
  await page.route('**/api/training/activity?*', async route => {
    activityReads += 1;
    if (activityReads > 1) await new Promise(resolve => setTimeout(resolve, 700));
    await route.fulfill({ json: { timezone: 'Europe/Amsterdam', today: '2026-10-02', coverageStartedAt: null,
      days: Array.from({ length: 366 }, (_, index) => ({ date: shiftDate('2026-10-02', index - 365), newCount: 2, reviewCount: 3, activeMilliseconds: 60000 })) } });
  });
  await page.route('**/api/training/material-progress?*', async route => {
    materialReads += 1;
    if (materialReads > 1) await new Promise(resolve => setTimeout(resolve, 700));
    await route.fulfill({ json: { languageCode: 'nl', materials: [{ kind: 'all', total: 100, started: 17, due: 5 }] } });
  });
  const tabs = page.locator('[data-app-mobile-navigation="tabs"]');
  await tabs.getByRole('button').nth(2).click();
  await expect.poll(() => activityReads).toBe(1); await expect.poll(() => materialReads).toBe(1);
  await expect(page.locator('button[data-level]:visible').first()).toBeVisible();
  for (let visit = 0; visit < 3; visit++) {
    await tabs.getByRole('button').nth(0).click();
    await tabs.getByRole('button').nth(2).click();
    await expect(page.locator('button[data-level]:visible').first()).toBeVisible();
    await expect.poll(() => activityReads).toBe(visit + 2);
    await expect.poll(() => materialReads).toBe(visit + 2);
    await expect(page.locator('button[data-level]:visible').first()).toBeVisible();
  }
  await testInfo.attach('retention-evidence.json', { body: JSON.stringify({ source: 'real Statistics UI, mocked transport', visits: 4, activityReads, materialReads }), contentType: 'application/json' });
});

test("@pilot builder offers one Translation with a nonempty contextual direction", async ({ page }) => {
  await page.setViewportSize({ width: 610, height: 900 });
  await setupAuthenticatedTrainingAttributionPage(page, 0, { visualProfile: "answer", devTestLogin: process.env.TRAINING_RELIABILITY_DEV_LOGIN === "true" });
  // Attribution's default scenario intentionally permits only direct cards.
  // Supply the production two-direction contract for this builder-specific case.
  await page.route('**/rest/v1/rpc/get_training_scenarios', route => route.fulfill({ json: [{
    id: 'understanding', name_en: 'Understanding', name_nl: 'Begrip',
    card_modes: ['word-to-definition', 'definition-to-word'], graduation_threshold: 21, enabled: true, sort_order: 1,
  }] }));
  await page.reload();
  await page.locator('button[class*="configure"]').click();
  await expect(page.getByRole('heading', { name: /Session builder|Настройка тренировки|Training samenstellen/i })).toBeVisible();
  await page.getByRole('button', { name: /^(Exercises|Упражнения|Oefeningen) /i }).click();
  const translation = page.getByRole('button', { name: /^(Translation|Перевод|Vertaling)$/i });
  await expect(translation).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^Word in context$/i })).toHaveCount(0);
  await translation.click();
  await expect(page.locator('[class*="directionHeading"]')).toHaveCount(1);
  await expect(page.locator('[class*="directionHeading"]')).not.toBeEmpty();
});
