import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";

test.skip(process.env.NEXT_PUBLIC_TRAINING_PRESENTATION_V1 !== "true", "Approved presentation is opt-in.");

for (const palette of ["lavender", "blue", "graphite"]) {
  for (const mode of ["light", "dark"] as const) {
    for (const size of ["normal", "extra"]) {
      test(`${palette} ${mode} ${size}: Russian compact session retains controls`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: 320, height: 568 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await setupAuthenticatedTrainingAttributionPage(page, 0, {
          visualProfile: "answer",
          settingsOverrides: {
            practice_palette: palette,
            theme_preference: mode,
            reading_size_phone: size,
            reading_size_desktop: size,
            preferences: { onboardingCompleted: true, onboardingLanguage: "ru" },
          },
        });
        await page.getByRole("button", { name: "Начать тренировку", exact: true }).click();
        await expect(page.locator("[data-account-palette]")).toHaveAttribute("data-account-palette", palette);
        await expect(page.locator("[data-reading-size]")).toHaveAttribute("data-reading-size", size);
        await page.getByRole("button", { name: "Показать ответ", exact: true }).click();
        const overlaps = await page.getByTestId("training-answer-header-actions").evaluate(actions => {
          const controls = actions.getBoundingClientRect();
          const metadata = actions.previousElementSibling!;
          return Array.from(metadata.children).some(child => {
            const rect = child.getBoundingClientRect();
            return rect.left < controls.right && rect.right > controls.left && rect.top < controls.bottom && rect.bottom > controls.top;
          });
        });
        expect(overlaps).toBe(false);
        const ratings = page.getByTestId("training-review-grid");
        await expect(ratings).toBeInViewport({ ratio: 1 });
        const boxes = await ratings.locator("button[data-rating]").evaluateAll(elements => elements.map(element => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, bottom: rect.bottom, width: element.clientWidth, scroll: element.scrollWidth };
        }));
        expect(boxes).toHaveLength(4);
        for (const box of boxes) {
          expect(box.left).toBeGreaterThanOrEqual(0);
          expect(box.right).toBeLessThanOrEqual(320);
          expect(box.bottom).toBeLessThanOrEqual(568);
          expect(box.scroll).toBeLessThanOrEqual(box.width);
        }
        expect(await page.locator("html").evaluate(element => element.scrollWidth)).toBe(320);
        await page.screenshot({ path: testInfo.outputPath("compact-answer.png") });
      });
    }
  }
}
