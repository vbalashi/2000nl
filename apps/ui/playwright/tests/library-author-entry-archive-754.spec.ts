import { expect, test, type Route } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";
import { financeEntry, furnitureEntry, multiSenseBankGroup } from "../../tests/platformV2LibraryFixture";
import type { PlatformHeadwordGroupV2 } from "../../../../packages/shared/types/platformV2";

// Mocked transport, real authenticated Library UI. Real RPC/API coverage lives
// separately in authorEntryArchive*.test.ts and the local contract QA.
for (const scenario of [
  { width: 1280, lostResponse: false },
  { width: 390, lostResponse: false },
  { width: 1280, lostResponse: true },
]) test(`@pilot #754 Library archive ${scenario.width}px${scenario.lostResponse ? " reconciles a lost response" : " confirmation and refresh"}`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: scenario.width, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setupAuthenticatedTrainingAttributionPage(page, 0, { visualProfile: "answer" });

  const ownGroup: PlatformHeadwordGroupV2 = {
    ...structuredClone(multiSenseBankGroup),
    headwordGroupId: "group-own-gedoe",
    dictionary: { ...multiSenseBankGroup.dictionary, displayName: "My dictionary" },
    header: { ...multiSenseBankGroup.header, text: "gedoe", displayPronunciation: "gedoe", article: "het" },
    senseCount: 1, entryCount: 1,
    entries: [{ ...structuredClone(financeEntry), meaningOrdinal: 1, authorActions: { canArchive: true }, sourceVersion: 1 }],
  };
  const remainingGroup: PlatformHeadwordGroupV2 = {
    ...structuredClone(multiSenseBankGroup),
    headwordGroupId: "group-remaining-bank", senseCount: 1, entryCount: 1,
    entries: [structuredClone(furnitureEntry)],
  };
  let archived = false, writes = 0, statusReads = 0, browseReads = 0;
  const respond = async (route: Route) => {
    const body = route.request().postDataJSON();
    const browse = new URL(route.request().url()).pathname === "/api/library/search";
    if (browse) browseReads++;
    const groups = browse
      ? archived ? [remainingGroup] : [ownGroup, remainingGroup]
      : body.entryId === financeEntry.entryId ? archived ? [] : [ownGroup] : [remainingGroup];
    await route.fulfill({ json: {
      contractVersion: "platform-lookup-v2", query: body.query ?? "gedoe",
      request: { contentLanguageCode: body.contentLanguageCode, translationTargetLanguageCode: body.translationTargetLanguageCode, cardTypeId: body.cardTypeId, intent: body.intent },
      groups, page: { selectedTierComplete: true, nextGroupCursor: null },
      librarySearch: { totalGroups: groups.length, matchingEntryIds: groups.flatMap(group => group.entries.flatMap(entry => entry.kind === "sense-card" ? [entry.entryId] : [])), unavailableEntryCount: 0 },
    } });
  };
  // Later routes override the training harness only for the Library operations.
  await page.route("**/api/library/search", respond);
  await page.route("**/api/platform/v2/lookup", respond);
  await page.route("**/api/platform/v1/actions", async route => {
    expect(route.request().postDataJSON()).toEqual({ action: "delete-user-entry", entryId: financeEntry.entryId });
    writes++; archived = true;
    if (scenario.lostResponse) await route.abort("failed");
    else await route.fulfill({ json: { ok: true, action: "delete-user-entry", entryId: financeEntry.entryId } });
  });
  await page.route(`**/api/library/author-entries/${financeEntry.entryId}/archive`, async route => {
    expect(route.request().method()).toBe("GET"); statusReads++;
    await route.fulfill({ json: { entryId: financeEntry.entryId, archived, archivedAt: archived ? "2026-10-25T00:00:00Z" : null, sourceVersion: 2 } });
  });

  if (scenario.width < 701) await page.locator('[data-app-mobile-navigation="tabs"]').getByRole("button").nth(1).click();
  else await page.locator('[data-app-primary-navigation="desktop"]').getByRole("button", { name: /Library|Bibliotheek|Библиотека/i }).click();
  const ownRow = page.getByTestId("library-headword-group-group-own-gedoe");
  await expect(ownRow).toBeVisible(); await ownRow.click();
  if (scenario.width < 701) {
    const handle = page.getByRole("button", { name: /Expand word card|Collapse word card|Развернуть карточку слова|Свернуть карточку слова|Woordkaart uitklappen|Woordkaart inklappen/i });
    await expect(handle).toBeVisible(); await handle.press("End");
  }
  const card = page.locator(`article[data-entry-id="${financeEntry.entryId}"]:visible`);
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: /More card actions|Meer kaartacties|Ещё|Другие действия/i }).click();
  const archiveItem = page.getByRole("menuitem", { name: /^(Archive entry|Архивировать статью|Artikel archiveren)$/ });
  await expect(archiveItem).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("menu.png") });
  await archiveItem.click();
  const dialog = page.getByRole("dialog", { name: /gedoe/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading")).toContainText("gedoe");
  await expect(dialog.getByRole("button", { name: /^(Cancel|Отмена|Annuleren)$/ })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("confirmation.png") });
  // Opening and cancelling cannot mutate the entry.
  await dialog.getByRole("button", { name: /^(Cancel|Отмена|Annuleren)$/ }).click();
  await expect(dialog).toBeHidden(); expect(writes).toBe(0);
  await card.getByRole("button", { name: /More card actions|Meer kaartacties|Ещё|Другие действия/i }).click();
  await archiveItem.click();
  const readsBeforeArchive = browseReads;
  await dialog.getByRole("button", { name: /^(Archive|Архивировать|Archiveren)$/ }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => browseReads).toBeGreaterThan(readsBeforeArchive);
  await expect(ownRow).toHaveCount(0);
  await expect(page.getByTestId("library-headword-group-group-remaining-bank")).toBeVisible();
  await expect(page.locator('article[data-testid^="library-sense-card-"]:visible')).toHaveCount(0);
  await expect(page.locator('section[data-dragging]:visible')).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: /Entry archived|Статья архивирована|Artikel gearchiveerd/ })).toBeVisible();
  expect(writes).toBe(1); expect(statusReads).toBe(scenario.lostResponse ? 1 : 0);
  await page.screenshot({ path: testInfo.outputPath("archived.png") });
});
