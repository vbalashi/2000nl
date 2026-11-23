import { devices, expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";
import { buildFakeSupabaseSession, installSupabaseSession } from "../utils/supabaseTestSession";

test.use({ ...devices["iPhone 13"], defaultBrowserType: "webkit" });

test("collection source and text edits survive touch blur and reopening", async ({ page }) => {
  const id = "75600000-0000-4000-8000-000000000001";
  const name = "Touch fixture";
  const title = "Edited material title";
  let reads = 0;
  const patches: unknown[] = [];
  let source: Record<string, string> | null = null;

  const userId = "75600000-0000-4000-8000-000000000002";
  await setupAuthenticatedTrainingAttributionPage(page, 0, {
    userId,
    deferNavigation: true,
    visualProfile: "answer",
    settingsOverrides: { preferences: { onboardingLanguage: "en" } },
  });
  await page.route("**/rpc/get_available_word_lists", route => {
    if (route.request().postDataJSON()?.p_list_type !== "user") return route.fallback();
    return route.fulfill({ json: [{ id, name, language_code: "nl", user_word_list_items: [{ count: 2 }] }] });
  });
  await page.route("**/api/library/collection-labels", route =>
    route.fulfill({ json: { revision: 0, labels: [], assignments: [] } }));
  await page.route("**/api/library/collection-details*", async route => {
    if (route.request().method() === "POST") {
      const { collectionId, expectedRevision, patch } = route.request().postDataJSON();
      expect(collectionId).toBe(id);
      expect(expectedRevision).toBe(String(patches.length));
      patches.push(patch);
      source = { ...source, ...patch.source };
    } else {
      expect(new URL(route.request().url()).searchParams.get("collectionId")).toBe(id);
      reads++;
    }
    await route.fulfill({ json: {
      id, name, isOwner: true, description: null, source, revision: String(patches.length),
    } });
  });

  await installSupabaseSession(page, buildFakeSupabaseSession({ id: userId, email: "reader@fixture.local" }));
  await page.goto("/");
  await page.locator('[data-app-mobile-navigation="tabs"]').getByRole("button", { name: "Library", exact: true }).tap();
  await page.getByRole("navigation", { name: "Library" }).getByRole("button", { name: "Collections" }).tap();
  const collection = page.getByRole("button", { name, exact: true });
  await collection.tap();
  const details = page.getByRole("dialog", { name: "Collections", exact: true });
  await details.getByRole("button", { name: "Edit Source", exact: true }).tap();
  await details.getByRole("button", { name: "Source: Not specified" }).tap();
  await page.getByRole("menuitemradio", { name: "YouTube" }).tap();
  await expect(details.getByText("YouTube", { exact: true })).toBeVisible();

  await details.getByRole("button", { name: "Edit Original material title" }).tap();
  await details.getByRole("textbox", { name: "Original material title" }).fill(title);
  await details.getByRole("heading", { name, exact: true }).tap();
  await expect(details.getByText(title, { exact: true })).toBeVisible();
  expect(patches).toEqual([{ source: { originKind: "youtube" } }, { source: { materialTitle: title } }]);

  await details.getByRole("button", { name: "Close", exact: true }).tap();
  await expect(details).toHaveCount(0);
  const previousReads = reads;
  await collection.tap();
  await expect(details.getByText("YouTube", { exact: true })).toBeVisible();
  await expect(details.getByText(title, { exact: true })).toBeVisible();
  expect(reads).toBeGreaterThan(previousReads);
});
