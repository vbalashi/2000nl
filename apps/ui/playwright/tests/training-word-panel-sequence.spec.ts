import { platformV2Message } from "../../lib/platform/platformV2ClientI18n";
import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";

test.skip(process.env.NEXT_PUBLIC_TRAINING_PRESENTATION_V1 !== "true" ||
  process.env.NEXT_PUBLIC_SHARED_ARTICLE_PRESENTATION_V1 !== "true", "Approved presentation is opt-in.");

for (const width of [320, 390, 1024]) {
  test(`word panel enters before the selected meaning expands, and restores focus at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await setupAuthenticatedTrainingAttributionPage(page, 0, { visualProfile: "answer",
      settingsOverrides: {
        reading_size_phone: width === 390 ? "normal" : "extra",
        reading_size_desktop: width === 390 ? "normal" : "extra",
        preferences: { onboardingCompleted: true, onboardingLanguage: width === 320 ? "ru" : width === 390 ? "nl" : "en" },
      },
    });
    await page.getByRole("button", { name: /Training starten|Start training|Начать тренировку/i }).click();
    await page.getByRole("button", { name: /Show answer|Antwoord tonen|Показать ответ/i }).click();
    await expect(page.getByRole("button", { name: /Again|Opnieuw|Снова/i })).toBeEnabled();
    const language = width === 320 ? "ru" : width === 390 ? "nl" : "en";
    const t = (key: string) => platformV2Message(language, key);
    let membershipUnavailable = true;
    await page.route("**/rest/v1/rpc/get_user_list_memberships_for_entries", route => route.fulfill(
      membershipUnavailable ? { status: 503, json: { code: "QA_READ_FAILED", message: "temporary read failure" } } : { json: [] },
    ));
    const stage = page.getByTestId("training-sense-card-stage");
    const opener = stage.getByRole("button", { name: /Word details|Woorddetails|Сведения о слове/i });
    await opener.click();
    const panel = page.getByRole("dialog", { name: /Word details|Woorddetails|Сведения о слове/i });
    await expect(panel).toBeVisible();
    await expect(panel.locator('[data-expanded="true"]')).toHaveCount(0);
    const entryMotion = await panel.evaluate(node => node.getAnimations().map(animation => animation.effect?.getTiming().duration));
    expect(entryMotion).toContain(460);
    await expect(panel.locator('[data-expanded="true"]')).toHaveCount(1);
    const reading = panel.getByTestId("library-sense-card-scroll-region");
    await reading.focus();
    await expect(reading).toBeFocused();
    await page.keyboard.press("k");
    await expect(stage).toHaveAttribute("data-side", "answer");
    await expect(panel).toBeVisible();
    const collections = panel.getByRole("button", { name: /^(Collections|Collecties|Коллекции)/ });
    await collections.click();
    const picker = page.getByRole("dialog", { name: /^(Collections|Collecties|Коллекции)/ });
    await expect(picker).toBeVisible();
    await expect(picker.getByRole("textbox").first()).toBeFocused();
    expect(await picker.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await expect(picker.getByRole("alert")).toContainText(t("senseCard.collections.membershipFailed"));
    await expect(picker.getByText(t("senseCard.collections.empty"), { exact: true })).toHaveCount(0);
    await picker.getByPlaceholder(t("senseCard.collections.createPlaceholder")).fill("QA, not submitted");
    const create = picker.getByRole("button", { name: t("senseCard.collections.create"), exact: true });
    await expect(create).toBeDisabled();
    membershipUnavailable = false;
    await picker.getByRole("button", { name: t("senseCard.collections.retryMembership"), exact: true }).click();
    await expect(picker.getByRole("alert")).toHaveCount(0);
    await expect(create).toBeEnabled();
    await expect(picker.getByRole("button", { name: /^(Done|Gereed|Готово)$/ })).toBeInViewport({ ratio: 1 });
    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);
    await expect(panel).toBeVisible();
    await expect(collections).toBeFocused();
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
