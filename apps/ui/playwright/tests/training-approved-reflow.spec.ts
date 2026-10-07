import { expect, test } from "@playwright/test";
import { assertTestFontsReady } from "../utils/assertTestFontsReady";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";
for (const locale of ["en", "nl", "ru"]) {
  for (const viewport of [{ width: 844, height: 390 }, { width: 640, height: 400 }]) {
    test(`${locale} Extra retains a readable answer and ratings at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
      // 640×400 is CSS-space reflow equivalent to 1280×800 at 200%, not native zoom.
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await setupAuthenticatedTrainingAttributionPage(page, 0, {
        visualProfile: "long-idiom",
        settingsOverrides: {
          reading_size_phone: "extra", reading_size_desktop: "extra",
          preferences: { onboardingCompleted: true, onboardingLanguage: locale },
        },
      });
      await assertTestFontsReady(page);
      await page.getByRole("button", { name: /Training starten|Start training|Начать тренировку/i }).click();
      await page.getByRole("button", { name: /Show answer|Antwoord tonen|Показать ответ/i }).click();
      const ratings = page.getByTestId("training-review-grid");
      await expect(ratings).toBeInViewport({ ratio: 1 });
      const scroll = page.getByTestId("training-answer-scroll");
      const body = await scroll.boundingBox();
      expect(body!.height).toBeGreaterThan(80);
      await scroll.press("End");
      await expect.poll(() => scroll.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThanOrEqual(1);
      await scroll.press("Home");
      await expect.poll(() => scroll.evaluate(node => node.scrollTop)).toBe(0);
      await scroll.press("Space");
      await expect.poll(() => scroll.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
      await expect(page.getByTestId("training-sense-card-stage")).toHaveAttribute("data-side", "answer");
      await expect(ratings).toBeInViewport({ ratio: 1 });
      expect(await page.locator("html").evaluate(node => node.scrollWidth)).toBe(viewport.width);
      await page.addStyleTag({ content: `
        [data-testid="training-sense-card-stage"] :is(p, h2, span, button),
        [data-testid="training-session-chrome"] span {
          line-height: 1.5 !important;
          letter-spacing: .12em !important;
          word-spacing: .16em !important;
        }
        [data-testid="training-sense-card-stage"] p { margin-bottom: 2em !important; }
      ` });
      await expect(ratings).toBeInViewport({ ratio: 1 });
      const spacedBody = await scroll.boundingBox();
      expect(spacedBody!.height).toBeGreaterThan(48);
      expect(await page.locator("html").evaluate(node => node.scrollWidth)).toBe(viewport.width);
      await scroll.press("End");
      await expect.poll(() => scroll.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath("short-answer.png") });
    });
  }
}

test("a reverse Face hint remains reachable in its scroll region", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dev/sense-card-gate?prototype=reading&mode=reverse&fixture=long&clean=1");
  await assertTestFontsReady(page);
  const stage = page.getByTestId("training-sense-card-stage");
  const region = page.getByRole("region", { name: "Kaartinhoud", exact: true });
  const hint = region.locator("aside");
  const prompt = stage.getByTestId("reverse-prompt");
  await expect(stage).toHaveAttribute("data-side", "face");
  await expect(prompt).toBeVisible();
  await region.press("End");
  await expect.poll(async () => {
    const promptBox = await prompt.boundingBox();
    const regionBox = await region.boundingBox();
    return promptBox!.y + promptBox!.height <= regionBox!.y + regionBox!.height;
  }).toBe(true);
  await region.press("Home");
  await stage.getByRole("button", { name: "Hint tonen", exact: true }).click();
  await expect(hint).toBeVisible();
  const [promptBox, hintBox] = await Promise.all([prompt.boundingBox(), hint.boundingBox()]);
  expect(hintBox!.y).toBeGreaterThanOrEqual(promptBox!.y + promptBox!.height);
  const dock = stage.getByTestId("training-sense-card-dock");
  const dockBeforeScroll = await dock.boundingBox();
  await region.press("End");
  await expect.poll(async () => {
    const hintBox = await hint.boundingBox();
    const regionBox = await region.boundingBox();
    return hintBox!.y + hintBox!.height <= regionBox!.y + regionBox!.height;
  }).toBe(true);
  expect(await dock.boundingBox()).toEqual(dockBeforeScroll);
  await expect(stage).toHaveAttribute("data-side", "face");
  await expect(stage.getByRole("button", { name: "Antwoord tonen", exact: true })).toBeInViewport();
});

test("the selected translation at the end of a long Answer remains reachable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dev/sense-card-gate?prototype=reading&fixture=long&clean=1");
  await assertTestFontsReady(page);
  const stage = page.getByTestId("training-sense-card-stage");
  await stage.getByRole("button", { name: "Antwoord tonen", exact: true }).click();
  await stage.getByRole("button", { name: "Vertalen", exact: true }).click();
  const scroll = page.getByTestId("training-answer-scroll");
  const headword = stage.getByTestId("sense-card-headword-lockup");
  const dock = stage.getByTestId("training-sense-card-dock");
  const [headwordBefore, dockBefore] = await Promise.all([headword.boundingBox(), dock.boundingBox()]);
  const lastTranslation = scroll.locator('[data-content-translation="true"]').last();
  await expect.poll(() => scroll.evaluate(element => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0);
  await scroll.press("End");
  await expect.poll(() => scroll.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThanOrEqual(1);
  const translationBounds = await lastTranslation.evaluate(element => {
    const region = element.closest<HTMLElement>('[data-testid="training-answer-scroll"]')!;
    const text = element.getBoundingClientRect();
    const contentTop = region.getBoundingClientRect().top + region.clientTop;
    const contentBottom = contentTop + region.clientHeight;
    return {
      fullyVisible: text.top >= contentTop && text.bottom <= contentBottom,
      textTop: text.top,
      textBottom: text.bottom,
      contentTop,
      contentBottom,
      scrollTop: region.scrollTop,
      scrollHeight: region.scrollHeight,
      clientHeight: region.clientHeight,
    };
  });
  expect(translationBounds.fullyVisible, JSON.stringify(translationBounds)).toBe(true);
  expect(await headword.boundingBox()).toEqual(headwordBefore);
  expect(await dock.boundingBox()).toEqual(dockBefore);
});
