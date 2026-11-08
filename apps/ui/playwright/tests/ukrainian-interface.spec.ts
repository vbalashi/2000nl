import { expect, test } from "@playwright/test";
import { multiSenseBankGroup } from "../../tests/platformV2LibraryFixture";
import uk from "../../locales/uk.json";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";

for (const viewport of [{width: 1440, height: 1000}, {width: 390, height: 844}]) {
  test(`Ukrainian settings and training retain Dutch learning material at ${viewport.width}px`, async ({page}, info) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({reducedMotion: "reduce"});
    await setupAuthenticatedTrainingAttributionPage(page, 0, {
      devTestLogin: false,
      visualProfile: "answer",
      settingsOverrides: {preferences: {onboardingLanguage: "uk"}},
    });
    await expect(page.locator("html")).toHaveAttribute("lang", "uk");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await page.locator('[data-tour="settings-button"]').click();
    await expect(page.getByRole("heading", {name: uk.ui.settings.title, exact: true, level: 1})).toBeVisible();
    await page.getByRole("navigation", {name: viewport.width < 700 ? uk.ui.settings.mobileSections : uk.ui.settings.sections, exact: true})
      .getByRole("button", {name: uk.ui.settings.languages, exact: true}).click();
    await page.getByRole("button", {name: `? ${uk.ui.settings.translationLanguage}`, exact: true}).click();
    await expect(page.getByText(uk.ui.settings.translationAttribution, {exact: true})).toBeVisible();
    await page.keyboard.press("Escape");
    await page.screenshot({path: info.outputPath("uk-settings.png")});
    await page.getByRole("button", {name: uk.ui.settings.interfaceLanguage, exact: true}).click();
    await expect(page.getByRole("menuitem", {name: "Українська"})).toBeVisible();
    await page.keyboard.press("Escape");
    await page.locator('[data-tour="settings-button"]').click();
    await page.route("**/api/library/search", async route => {
      const request = route.request().postDataJSON();
      await route.fulfill({json: {
        contractVersion: "platform-lookup-v2", query: request.query ?? "",
        request: {contentLanguageCode: request.contentLanguageCode, translationTargetLanguageCode: request.translationTargetLanguageCode, cardTypeId: request.cardTypeId, intent: request.intent},
        groups: [multiSenseBankGroup], page: {selectedTierComplete: true, nextGroupCursor: null},
        librarySearch: {totalGroups: 1, totalMeanings: 2, matchingEntryIds: multiSenseBankGroup.entries.map(entry => entry.kind === "sense-card" ? entry.entryId : entry.crossReferenceId)},
      }});
    });
    await page.getByRole("button", {name: uk.ui.navigation.library, exact: true}).click();
    await expect(page.getByPlaceholder(uk.ui.library.searchPlaceholder)).toBeVisible();
    await expect(page.getByTestId("library-headword-group-row").first()).toBeVisible();
    await page.getByRole("button", {name: "1 стаття", exact: true}).click();
    await expect(page.getByRole("menu", {name: "1 стаття · 2 значення", exact: true})
      .getByText("1 стаття · 2 значення", {exact: true})).toBeVisible();
    await page.keyboard.press("Escape");
    await page.screenshot({path: info.outputPath("uk-library.png")});
    await page.getByRole("button", {name: uk.ui.navigation.training, exact: true}).click();
    await page.locator('[data-onboarding="launch"]').click();
    const card = page.getByTestId("training-sense-card-v2");
    await expect(card).toBeVisible();
    await page.getByRole("button", {name: uk.senseCard.answer.show, exact: true}).click();
    await expect(page.getByRole("group", {name: uk.senseCard.sections.reviewPrompt, exact: true})).toBeVisible();
    await expect(page.getByRole("button", {name: uk.senseCard.review.success, exact: true})).toBeVisible();
    // Dictionary content is deliberately Dutch; changing UI must not translate it.
    await expect(card.getByRole("heading", {name: "bank", exact: true})).toBeVisible();
    await expect(card.getByText("een zitmeubel voor meerdere mensen", {exact: true})).toBeVisible();
    await page.screenshot({path: info.outputPath("uk-training.png")});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test("Ukrainian is selectable from English and onboarding copy changes immediately", async ({page}) => {
  await setupAuthenticatedTrainingAttributionPage(page, 0, {
    devTestLogin: false,
    visualProfile: "answer",
    settingsOverrides: {preferences: {onboardingCompleted: false, onboardingLanguage: "en"}},
  });
  await expect(page.getByRole("heading", {name: "Choose your interface language"})).toBeVisible();
  await page.locator('[data-onboarding="interface"]').click();
  await page.getByRole("menuitem", {name: "Українська"}).click();
  await expect(page.getByRole("heading", {name: uk.tour.interfaceTitle})).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "uk");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("onboarding_language"))).toBe("uk");
  await page.getByRole("button", {name: uk.tour.continue, exact: true}).click();
  await expect(page.getByRole("heading", {name: uk.tour.translationTitle})).toBeVisible();
});
