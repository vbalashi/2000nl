import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";
test("@pilot reload retains the approved startup surface until the overview is ready", async ({page}) => {
  await page.addInitScript(() => {
    const observed: string[] = [];
    Object.assign(window, {startupSurfaces: observed});
    const sample = () => {
      for (const element of document.querySelectorAll('[data-context="training"][role="status"]')) {
        if (element.checkVisibility({checkVisibilityCSS: true})) observed.push(element.textContent ?? "");
      }
    };
    new MutationObserver(sample).observe(document, {childList: true, attributes: true, subtree: true});
  });
  await setupAuthenticatedTrainingAttributionPage(page, 0, {
    visualProfile: "answer", devTestLogin: process.env.TRAINING_RELIABILITY_DEV_LOGIN === "true",
    activeScopeDelayMs: 700, listSummaryDelayMs: 700, statsDelayMs: 1200,
  });
  await expect(page.getByRole("button", {name: /^(Start training|Начать тренировку|Training starten)$/i})).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as {startupSurfaces: string[]}).startupSurfaces)).toEqual([]);
  await page.reload();
  await expect(page.getByRole("button", {name: /^(Start training|Начать тренировку|Training starten)$/i})).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as {startupSurfaces: string[]}).startupSurfaces)).toEqual([]);
});
