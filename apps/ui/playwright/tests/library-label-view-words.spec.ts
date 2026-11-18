import { expect, test, devices } from "@playwright/test";
import { multiSenseBankGroup } from "../../tests/platformV2LibraryFixture";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";

test.use({ ...devices["Pixel 7"], defaultBrowserType: "chromium" });

test("mobile View words closes Labels and leaves the scoped results interactive @pilot", async ({ page }) => {
  const labelId = "12200000-0000-4000-8000-000000000001";
  const timestamp = "2026-01-01T00:00:00Z";
  const totalGroups = 268;
  const entries = Array.from({ length: totalGroups }, (_, index) => {
    const group = structuredClone(multiSenseBankGroup);
    const sense = group.entries.find(entry => entry.kind === "sense-card")!;
    const entryId = `meaning-${index}`;
    group.header.text = `Fixture word ${index}`;
    return {
      entryId,
      group: {
        ...group,
        headwordGroupId: `article-${index}`,
        senseCount: 1,
        entries: [{ ...sense, entryId, translation: null, capabilities: [] }],
      },
    };
  });

  await page.route("**/api/library/collection-labels", route => route.fulfill({
    json: {
      revision: 1,
      labels: [{
        id: labelId, name: "Practice topics", parent_id: null, description: null,
        created_at: timestamp, updated_at: timestamp,
      }],
      assignments: [],
    },
  }));
  await page.route("**/api/library/search", route => {
    const { cursor, material } = route.request().postDataJSON();
    const scoped = material?.kind === "label" && material.id === labelId;
    const start = Number(cursor ?? 0);
    const batch = scoped ? entries.slice(start, start + 25) : [];
    const next = start + batch.length;
    return route.fulfill({
      json: {
        contractVersion: "platform-lookup-v2",
        query: "",
        request: {
          contentLanguageCode: "nl", translationTargetLanguageCode: null,
          cardTypeId: "word-to-definition", intent: "dictionary-lookup",
        },
        groups: batch.map(row => row.group),
        page: { selectedTierComplete: true, nextGroupCursor: scoped && next < totalGroups ? String(next) : null },
        librarySearch: {
          totalGroups: scoped ? totalGroups : 0,
          totalMeanings: scoped ? totalGroups : 0,
          matchingEntryIds: batch.map(row => row.entryId),
          unavailableEntryCount: 0,
        },
      },
    });
  });
  await setupAuthenticatedTrainingAttributionPage(page, 0, {
    visualProfile: "answer",
    settingsOverrides: { preferences: { onboardingLanguage: "en" } },
  });

  await page.locator('[data-app-mobile-navigation="tabs"]').getByRole("button", { name: "Library", exact: true }).tap();
  const tabs = page.getByRole("navigation", { name: "Library", exact: true });
  await tabs.getByRole("button", { name: "Collections", exact: true }).tap();
  const catalog = page.getByTestId("personal-collections");
  const labels = page.getByRole("dialog", { name: "Choose a label", exact: true });

  await catalog.getByRole("button", { name: "All collections", exact: true }).tap();
  await labels.getByRole("button", { name: "Practice topics", exact: true }).tap();
  await catalog.getByRole("button", { name: "Practice topics", exact: true }).tap();
  await labels.getByRole("button", { name: "More actions: Practice topics", exact: true }).tap();
  await labels.getByRole("menuitem", { name: "View words", exact: true }).tap();

  const pager = page.getByTestId("library-group-pagination");
  await expect(pager).toHaveText("1 / 6");
  await expect(page.getByRole("button", { name: "268 articles", exact: true })).toBeVisible();
  // A dialog in the hidden Collections tab can still make the whole document inert.
  await expect(page.locator("dialog:modal")).toHaveCount(0, { timeout: 2000 });
  await pager.getByRole("button", { name: "Next", exact: true }).tap();
  await expect(pager).toHaveText("2 / 6");
  await expect(page.getByTestId("library-headword-group-article-50")).toBeVisible();
  await tabs.getByRole("button", { name: "Collections", exact: true }).tap();
  await expect(catalog.getByRole("button", { name: "Practice topics", exact: true })).toBeVisible();
  await expect(page.locator("dialog:modal")).toHaveCount(0);
});
