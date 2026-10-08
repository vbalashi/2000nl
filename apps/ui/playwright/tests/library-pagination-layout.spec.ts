import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";
import { multiSenseBankGroup } from "../../tests/platformV2LibraryFixture";

test("@pilot Library pagination stays on one row with a selected detail at 820px", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setupAuthenticatedTrainingAttributionPage(page, 0, { visualProfile: "answer" });

  const respond = async (route: import("@playwright/test").Route) => {
    const request = route.request().postDataJSON();
    const groupOffset = request.cursor === "cursor-page-2" ? 25 : request.cursor === "cursor-page-3" ? 50 : 0;
    const groups = Array.from({ length: 25 }, (_, index) => ({
      ...multiSenseBankGroup,
      headwordGroupId: `${multiSenseBankGroup.headwordGroupId}-${groupOffset + index}`,
    }));
    await route.fulfill({
      json: {
        contractVersion: "platform-lookup-v2",
        query: request.query ?? "",
        request: {
          contentLanguageCode: request.contentLanguageCode,
          translationTargetLanguageCode: request.translationTargetLanguageCode,
          cardTypeId: request.cardTypeId,
          intent: request.intent,
        },
        groups,
        page: {
          selectedTierComplete: true,
          nextGroupCursor: request.cursor === "cursor-page-3"
            ? null
            : request.cursor === "cursor-page-2"
              ? "cursor-page-3"
              : "cursor-page-2",
        },
        librarySearch: {
          totalGroups: 100,
          matchingEntryIds: multiSenseBankGroup.entries.flatMap((entry) =>
            "entryId" in entry ? [entry.entryId] : [],
          ),
        },
      },
    });
  };
  await page.route("**/api/library/search", respond);
  await page.route("**/api/platform/v2/lookup", respond);

  await page
    .locator('[data-app-primary-navigation="desktop"]')
    .getByRole("button", { name: /Library|Bibliotheek/i })
    .click();
  await page.getByTestId("library-headword-group-row").first().click();

  const pagination = page.getByTestId("library-group-pagination");
  await expect(page.locator('[data-detail-open="true"]')).toBeVisible();
  await expect(pagination).toBeVisible();

  const controls = pagination.getByRole("button");
  await expect(controls).toHaveCount(2);
  const geometry = async () =>
    Promise.all([
      pagination.locator(":scope > span").boundingBox(),
      ...await controls.evaluateAll((buttons) =>
        buttons.map((button) => {
          const { x, y, width, height } = button.getBoundingClientRect();
          return { x, y, width, height };
        }),
      ),
    ]);
  const [indicator, previous, next] = await geometry();
  expect(indicator).not.toBeNull();
  expect(previous).not.toBeNull();
  expect(next).not.toBeNull();
  const centers = [indicator!, previous!, next!].map(({ y, height }) => y + height / 2);
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(1);
  expect(previous!.height).toBeGreaterThanOrEqual(28);
  expect(next!.height).toBeGreaterThanOrEqual(28);
  expect(previous!.width).toBeGreaterThanOrEqual(44);
  expect(next!.width).toBeGreaterThanOrEqual(44);

  await controls.last().click();
  await expect(pagination.locator(":scope > span")).toHaveText("2 / 2");
});
