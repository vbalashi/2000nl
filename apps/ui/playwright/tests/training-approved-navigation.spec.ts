import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";
const startButton =
  /Начать с текущими настройками|Start with current settings|Start met huidige instellingen|Huidige selectie starten|Training starten|Start training|Начать тренировку/i;

for (const viewport of [
  { name: "phone", width: 390, height: 844 },
  { name: "compact", width: 320, height: 568 },
]) {
  test(`${viewport.name}: bottom tabs navigate and step aside during a session`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await setupAuthenticatedTrainingAttributionPage(page, 0, { visualProfile: "answer" });
    // Bootstrap swaps its loading frame for the ready destination. Measure the ready frame.
    await expect(page.getByRole("button", { name: startButton })).toBeVisible();
    const tabs = page.locator('[data-app-mobile-navigation="tabs"]');
    await expect(tabs).toBeVisible();
    await expect(page.locator('[data-app-mobile-navigation="menu"]')).toHaveCount(0);
    const tabButtons = tabs.getByRole("button");
    await expect(tabButtons).toHaveCount(3);
    for (const box of await tabButtons.evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height)))
      expect(box).toBeGreaterThanOrEqual(44);
    const tabsBox = await tabs.boundingBox();
    expect(tabsBox!.y + tabsBox!.height).toBeLessThanOrEqual(viewport.height + 1);

    await page.getByRole("button", { name: startButton }).click();
    await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
    await expect(tabs).toBeHidden();
    await expect(page.getByTestId("app-header")).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-session.png`) });

    await page.getByRole("button", { name: /Закрыть сессию|Close session|Sessie sluiten/i }).click();
    await expect(tabs).toBeVisible();
    await tabs.getByRole("button").nth(1).click();
    await expect(tabs.getByRole("button").nth(1)).toHaveAttribute("aria-current", "page");
    await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-library.png`) });
  });
}
