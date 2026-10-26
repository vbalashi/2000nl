import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";
import { platformV2Message } from "../../lib/platform/platformV2ClientI18n";

// This gate tests the actual production Report owner with controlled lookup,
// not preview reporting and not a write to the live feedback service.
for (const [index, language] of (["en", "nl", "ru"] as const).entries()) {
  for (const mode of ["light", "dark"] as const) {
    test(`${language} ${mode}: Extra Report retains its footer and training state`, async ({ page }, testInfo) => {
      const t = (key: string) => platformV2Message(language, key);
      await page.setViewportSize({ width: mode === "light" ? 320 : 844, height: mode === "light" ? 568 : 390 });
      await page.emulateMedia({ colorScheme: mode, reducedMotion: "reduce" });
      await setupAuthenticatedTrainingAttributionPage(page, 0, { visualProfile: "answer", useUuidEntryIds: true, settingsOverrides: {
        reading_size_phone: "extra", reading_size_desktop: "extra", theme_preference: mode,
        practice_palette: ["lavender", "blue", "graphite"][index],
        preferences: { onboardingCompleted: true, onboardingLanguage: language },
      } });
      await page.getByRole("button", { name: /Training starten|Start training|Начать тренировку/i }).click();
      await page.getByRole("button", { name: t("senseCard.answer.show"), exact: true }).click();
      const stage = page.getByTestId("training-sense-card-stage");
      await expect(stage).toHaveAttribute("data-side", "answer");
      const opener = page.getByRole("button", { name: t("senseCard.report"), exact: true });
      const quietRow = stage.getByTestId("training-secondary-actions");
      await expect(quietRow).toBeVisible();
      expect(await quietRow.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      const quietGeometry = await quietRow.evaluate(node => {
        const box = node.getBoundingClientRect();
        return [...node.querySelectorAll("button")].map(button => {
          const rect = button.getBoundingClientRect();
          const style = getComputedStyle(button);
          return { contained: rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1,
            family: style.fontFamily, size: style.fontSize, color: style.color, weight: style.fontWeight };
        });
      });
      expect(quietGeometry).toHaveLength(2);
      expect(quietGeometry.every(item => item.contained)).toBe(true);
      expect(quietGeometry[0]).toEqual(quietGeometry[1]);
      await stage.screenshot({ path: testInfo.outputPath("quiet-actions-extra.png") });
      // Next dev badge overlaps the far-left Report label at 320px; use its real keyboard path.
      await opener.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: t("senseCard.reportSheet.title"), exact: true });
      await expect(dialog).toBeVisible();
      expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      const send = dialog.getByRole("button", { name: t("senseCard.reportSheet.send"), exact: true });
      const back = dialog.getByRole("button", { name: t("senseCard.reportSheet.back"), exact: true });
      await expect(send).toBeDisabled();
      await expect(send).toBeInViewport({ ratio: 1 });
      await expect(back).toBeInViewport({ ratio: 1 });
      await dialog.getByRole("radio").first().check();
      await expect(send).toBeEnabled();
      await dialog.locator("textarea").fill("layout QA, cancelled");
      const reading = dialog.getByRole("region", { name: t("senseCard.reportSheet.title"), exact: true });
      await reading.focus();
      await page.keyboard.press("End");
      await expect.poll(() => reading.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThanOrEqual(1);
      await expect(send).toBeInViewport({ ratio: 1 });
      await page.screenshot({ path: testInfo.outputPath("report-extra.png") });
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
      await expect(stage).toHaveAttribute("data-side", "answer");
      // Next dev badge overlaps the far-left Report label at 320px; use its real keyboard path.
      await opener.focus();
      await page.keyboard.press("Enter");
      await expect(dialog.locator("textarea")).toHaveValue("");
      await expect(send).toBeDisabled();
      await back.click();
      await expect(opener).toBeFocused();
      let deliveries = 0;
      await page.route("**/api/feedback/reports", async route => {
        deliveries += 1;
        const request = route.request().postDataJSON() as { reportId: string };
        await route.fulfill({ json: { status: "accepted", reportId: request.reportId } });
      });
      await opener.focus();
      await page.keyboard.press("Enter");
      await dialog.getByRole("radio").first().check();
      await send.click();
      await expect(dialog.getByRole("status")).toContainText(t("senseCard.reportSheet.states.sent.title"));
      expect(deliveries).toBe(1);
      const close = dialog.getByRole("button", { name: t("senseCard.reportSheet.close"), exact: true });
      await expect(close).toBeInViewport({ ratio: 1 });
      await expect(close).toBeFocused();
      await close.click();
      await expect(opener).toBeFocused();
      await expect(stage).toHaveAttribute("data-side", "answer");
    });
  }
}
