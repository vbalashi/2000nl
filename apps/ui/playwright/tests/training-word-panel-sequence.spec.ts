import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";

test.skip(process.env.NEXT_PUBLIC_TRAINING_PRESENTATION_V1 !== "true" ||
  process.env.NEXT_PUBLIC_SHARED_ARTICLE_PRESENTATION_V1 !== "true", "Approved presentation is opt-in.");

for (const width of [390, 1024]) {
  test(`word panel enters before the selected meaning expands, and restores focus at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await setupAuthenticatedTrainingAttributionPage(page, 0, { visualProfile: "answer" });
    await page.getByRole("button", { name: /Training starten|Start training|Начать тренировку/i }).click();
    await page.getByRole("button", { name: /Show answer|Antwoord tonen|Показать ответ/i }).click();
    await expect(page.getByRole("button", { name: /Again|Opnieuw|Снова/i })).toBeEnabled();
    const stage = page.getByTestId("training-sense-card-stage");
    const opener = stage.getByRole("button", { name: /Word details|Woorddetails|О слове/i });
    await opener.click();
    const panel = page.getByRole("dialog", { name: /Word details|Woorddetails|О слове/i });
    await expect(panel).toBeVisible();
    await expect(panel.locator('[data-expanded="true"]')).toHaveCount(0);
    const entryMotion = await panel.evaluate(node => node.getAnimations().map(animation => animation.effect?.getTiming().duration));
    expect(entryMotion).toContain(460);
    await expect(panel.locator('[data-expanded="true"]')).toHaveCount(1);
    await panel.getByRole("button", { name: /Close|Sluiten|Закрыть/, exact: true }).focus();
    await page.keyboard.press("Shift+Tab");
    // Native modality permits browser chrome focus, but never the page behind it.
    expect(await panel.evaluate(node => document.activeElement === document.body || node.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Tab");
    expect(await panel.evaluate(node => node.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(panel).toHaveAttribute("data-closing", "true");
    await expect(panel).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect(stage).toHaveAttribute("data-side", "answer");
  });
}
