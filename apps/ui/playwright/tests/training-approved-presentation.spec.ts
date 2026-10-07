import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";
for (const width of [402, 1024]) {
  test(`keeps the approved session controls visible at ${width}px`, async ({ browser }, testInfo) => {
    const page = await browser.newPage({ viewport: { width, height: 768 }, reducedMotion: "reduce" });
    await setupAuthenticatedTrainingAttributionPage(page, 0, {
      visualProfile: "answer",
    });
    await page.getByRole("button", {
      name: /^(?:Start training|Training starten|Начать тренировку)$/,
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

test("the whole outgoing card starts at its face origin and unlocks ratings after the shift", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await setupAuthenticatedTrainingAttributionPage(page, 0, { visualProfile: "answer" });
  await page.getByRole("button", { name: /Training starten|Start training|Начать тренировку/i }).click();
  const stage = page.getByTestId("training-sense-card-stage");
  const heading = stage.getByRole("heading", { level: 2 });
  const shell = stage.getByTestId("training-sense-card-shell");
  const outgoingText = await shell.textContent();
  const origin = await shell.boundingBox();
  await page.getByRole("button", { name: /Show answer|Antwoord tonen|Показать ответ/i }).click();
  const overlay = page.locator("[data-training-reveal-overlay]");
  await expect(overlay).toHaveCount(1);
  const initial = await overlay.evaluate(node => {
    const style = (node as HTMLElement).style;
    return { text: node.textContent, ariaHidden: node.getAttribute("aria-hidden"), inert: (node as HTMLElement).inert,
      position: style.position, left: parseFloat(style.left), top: parseFloat(style.top),
      width: parseFloat(style.width), height: parseFloat(style.height) };
  });
  expect(initial.text).toBe(outgoingText);
  expect(initial.ariaHidden).toBe("true");
  expect(initial.inert).toBe(true);
  expect(initial.position).toBe("fixed");
  expect(initial.left).toBeCloseTo(origin!.x, 1);
  expect(initial.top).toBeCloseTo(origin!.y, 1);
  expect(initial.width).toBeCloseTo(origin!.width, 1);
  expect(initial.height).toBeCloseTo(origin!.height, 1);
  const again = page.getByRole("button", { name: /Again|Opnieuw|Снова/i });
  await expect(again).toBeDisabled();
  await expect(overlay).toHaveCount(0);
  await expect(again).toBeEnabled();
  await expect(heading).toBeVisible();
  await expect(again).toBeFocused();
});

test("reverse definition remains in the outgoing card, with reduced-motion bypass", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/dev/sense-card-gate?prototype=reading&mode=reverse&clean=1");
  const question = await page.getByTestId("reverse-prompt").textContent();
  const shell = page.getByTestId("training-sense-card-shell");
  const outgoingText = await shell.textContent();
  await page.getByRole("button", { name: "Antwoord tonen", exact: true }).click();
  const overlay = page.locator("[data-training-reveal-overlay]");
  const firstFrameText = await overlay.textContent();
  expect(firstFrameText).toBe(outgoingText);
  expect(firstFrameText).toContain(question!);
  await expect(overlay).toHaveCount(0);
  await expect(page.getByTestId("training-sense-card-stage")).toHaveAttribute("data-side", "answer");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.getByRole("button", { name: "Antwoord tonen", exact: true }).click();
  await expect(overlay).toHaveCount(0);
  await expect(page.getByTestId("training-sense-card-stage")).not.toHaveAttribute("data-reveal-moving", "true");
});
