import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";

test.skip(process.env.NEXT_PUBLIC_TRAINING_PRESENTATION_V1 !== "true", "Approved presentation is opt-in.");

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
