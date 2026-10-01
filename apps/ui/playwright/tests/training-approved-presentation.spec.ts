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
      name: /Start with current settings|Start met huidige instellingen|Начать с текущими настройками|Huidige selectie starten|Training starten|Start training|Начать тренировку/i,
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
    // Columns follow the measured label widths, not a viewport breakpoint; hit areas stay >=44px.
    expect(buttonBox!.height).toBeGreaterThanOrEqual(44);
    const columns = await reviewGrid.locator("[data-columns]").getAttribute("data-columns");
    expect(["2", "4"]).toContain(columns);
    const ratingRows = new Set(await reviewGrid.locator("button[data-rating]").evaluateAll(
      (buttons) => buttons.map((button) => Math.round(button.getBoundingClientRect().top)),
    ));
    expect(ratingRows.size).toBe(columns === "4" ? 1 : 2);
    await page.screenshot({ path: testInfo.outputPath(`approved-session-${width}.png`) });
    await page.close();
  });
}

test("moving question starts at the face origin and unlocks ratings only after arrival", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await setupAuthenticatedTrainingAttributionPage(page, 0, { visualProfile: "answer" });
  await page.getByRole("button", { name: /Training starten|Start training|Начать тренировку/i }).click();
  const stage = page.getByTestId("training-sense-card-stage");
  const heading = stage.getByRole("heading", { level: 2 });
  const origin = await heading.evaluate(node => node.parentElement!.getBoundingClientRect().toJSON());
  await page.getByRole("button", { name: /Show answer|Antwoord tonen|Показать ответ/i }).click();
  const overlay = page.locator("[data-training-reveal-overlay]");
  await expect(overlay).toHaveCount(1);
  const initial = await overlay.evaluate(node => ({ left: parseFloat((node as HTMLElement).style.left), top: parseFloat((node as HTMLElement).style.top), opacity: getComputedStyle(node).opacity }));
  expect(initial.left).toBeCloseTo(origin.left, 1);
  expect(initial.top).toBeCloseTo(origin.top, 1);
  expect(initial.opacity).toBe("1");
  const again = page.getByRole("button", { name: /Again|Opnieuw|Снова/i });
  await expect(again).toBeDisabled();
  await expect(overlay).toHaveCount(0);
  await expect(again).toBeEnabled();
  await expect(heading).toBeVisible();
  await expect(again).toBeFocused();
});

test("reverse definition moves as the same question, with reduced-motion bypass", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/dev/sense-card-gate?prototype=reading&mode=reverse&clean=1");
  const question = await page.getByTestId("reverse-prompt").textContent();
  await page.getByRole("button", { name: "Antwoord tonen", exact: true }).click();
  const overlay = page.locator("[data-training-reveal-overlay]");
  await expect(overlay).toHaveText(question!);
  await expect(overlay).toHaveCount(0);
  await expect(page.getByTestId("training-sense-card-stage")).toHaveAttribute("data-side", "answer");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.getByRole("button", { name: "Antwoord tonen", exact: true }).click();
  await expect(overlay).toHaveCount(0);
  await expect(page.getByTestId("training-sense-card-stage")).not.toHaveAttribute("data-reveal-moving", "true");
});
