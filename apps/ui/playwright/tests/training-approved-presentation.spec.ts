import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";

test.skip(
  process.env.NEXT_PUBLIC_TRAINING_PRESENTATION_V1 !== "true",
  "This visual rollout is opt-in.",
);

for (const width of [402, 1024]) {
  test(`keeps the approved session controls visible at ${width}px`, async ({ browser }, testInfo) => {
    const page = await browser.newPage({ viewport: { width, height: 768 } });
    await setupAuthenticatedTrainingAttributionPage(page, 0, {
      visualProfile: "answer",
    });
    await page.getByRole("button", {
      name: /Start with current settings|Start met huidige instellingen|Начать с текущими настройками|Huidige selectie starten/i,
    }).click();

    const stage = page.getByTestId("training-sense-card-stage");
    await expect(stage).toHaveAttribute("data-visual-spec", "training-approved-v1");
    await expect(page.getByTestId("training-session-chrome"))
      .toHaveAttribute("data-visual-spec", "training-approved-v1");
    await expect(page.getByTestId("training-session-footer-progress"))
      .toBeHidden();

    await page.getByRole("button", {
      name: /Show answer|Antwoord tonen|Показать ответ/i,
    }).click();
    const again = page.getByRole("button", { name: /Again|Opnieuw|Снова/i });
    await expect(again).toBeVisible();
    const reviewGrid = page.getByTestId("training-review-grid");
    const gridBox = await reviewGrid.boundingBox();
    const stageBox = await stage.boundingBox();
    const buttonBox = await again.boundingBox();
    expect(gridBox && stageBox && buttonBox).toBeTruthy();
    expect(buttonBox!.y + buttonBox!.height).toBeLessThanOrEqual(768);
    expect(stageBox!.y + stageBox!.height).toBeLessThanOrEqual(768);
    expect(Math.round(gridBox!.height)).toBe(width < 640 ? 62 : 46);
    await page.screenshot({ path: testInfo.outputPath(`approved-session-${width}.png`) });
    await page.close();
  });
}
