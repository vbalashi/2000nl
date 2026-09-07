import { expect, test } from "@playwright/test";
import {
  gateBankGroup,
  gateFinanceEntry,
  gateFurnitureEntry,
  gateLongHeadwordGroup,
} from "../../lib/platform/fixtures/senseCardV1GateFixture";

const withReport = (entry: typeof gateFurnitureEntry) => ({ ...entry, reportContentRevision: "a".repeat(64) });
const single = {
  ...gateBankGroup, headwordGroupId: "bank-single",
  entries: [withReport(gateFurnitureEntry)], senseCount: 1, entryCount: 1,
};
const multi = {
  ...gateBankGroup, headwordGroupId: "bank-multi",
  entries: [withReport(gateFurnitureEntry), withReport(gateFinanceEntry)],
};

const viewports = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1440, height: 960 }];
const readingSizes = ["normal", "large", "largest"] as const;
const colorSchemes = ["light", "dark"] as const;

const regularHeadwordSize = { normal: "44px", large: "46px", largest: "48px" } as const;
const longHeadwordSize = {
  mobile: { normal: "32px", large: "34px", largest: "36px" },
  desktop: { normal: "40px", large: "42px", largest: "44px" },
} as const;

async function expectReviewedHeaderGeometry(page: import("@playwright/test").Page) {
  const row = page.getByTestId("sense-card-header-row");
  const metadata = row.getByTestId("sense-card-metadata");
  const actions = row.getByTestId("sense-card-header-actions");
  const translate = actions.getByRole("button", { name: "Vertalen", exact: true });
  const audio = actions.getByRole("button", { name: "Afspelen", exact: true });
  const lockup = page.getByTestId("sense-card-headword-lockup");
  const headword = lockup.getByRole("heading", { level: 2 });
  const header = page.getByTestId("library-sense-card-group").locator(":scope > header");

  await expect(row).toHaveCount(1);
  await expect(actions.getByRole("button")).toHaveCount(2);
  await expect(actions.getByRole("button").nth(0)).toHaveAttribute("aria-label", "Vertalen");
  await expect(actions.getByRole("button").nth(1)).toHaveAttribute("aria-label", "Afspelen");
  await expect(page.getByTestId("sense-card-headword-lockup").getByRole("button", { name: /Meer|More/, exact: true })).toHaveCount(0);

  const [headerBox, lockupBox, rowBox, metadataBox, actionsBox, translateBox, audioBox, headwordBox] = await Promise.all([
    header.boundingBox(), lockup.boundingBox(), row.boundingBox(), metadata.boundingBox(), actions.boundingBox(), translate.boundingBox(), audio.boundingBox(), headword.boundingBox(),
  ]);
  expect(headerBox && lockupBox && rowBox && metadataBox && actionsBox && translateBox && audioBox && headwordBox).toBeTruthy();
  const expectedHorizontalPadding = page.viewportSize()!.width >= 640 ? 28 : 16;
  expect(rowBox!.x - headerBox!.x).toBe(expectedHorizontalPadding);
  expect(headerBox!.x + headerBox!.width - (rowBox!.x + rowBox!.width)).toBe(expectedHorizontalPadding);
  expect(rowBox!.y - headerBox!.y).toBe(16);
  expect(headerBox!.y + headerBox!.height - (lockupBox!.y + lockupBox!.height)).toBe(20);
  expect(actionsBox!.x + actionsBox!.width).toBe(rowBox!.x + rowBox!.width);
  expect(actionsBox!.x - (metadataBox!.x + metadataBox!.width)).toBeGreaterThanOrEqual(11.5);
  expect(translateBox!.width).toBe(40);
  expect(translateBox!.height).toBe(40);
  expect(audioBox!.width).toBe(40);
  expect(audioBox!.height).toBe(40);
  await expect(translate).toHaveCSS("border-radius", "16px");
  await expect(audio).toHaveCSS("border-radius", "16px");
  await expect(translate.locator("svg")).toHaveCSS("width", "20px");
  await expect(translate.locator("svg")).toHaveCSS("height", "20px");
  await expect(audio.locator("svg")).toHaveCSS("width", "20px");
  await expect(audio.locator("svg")).toHaveCSS("height", "20px");
  expect(audioBox!.x - (translateBox!.x + translateBox!.width)).toBe(8);
  const rowToHeadwordGap = headwordBox!.y - (rowBox!.y + rowBox!.height);
  expect(rowToHeadwordGap).toBeGreaterThanOrEqual(11.5);
  expect(rowToHeadwordGap).toBeLessThanOrEqual(12.5);
}

for (const viewport of viewports) {
  for (const size of readingSizes) {
  for (const colorScheme of colorSchemes) {
  test(`unified single/multi Details and reachable footer at ${viewport.width} ${size} ${colorScheme}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme });
    const lookups: string[] = [];
    const selectedGroup = size === "largest" ? {
      ...multi, senseCount: 20, entryCount: 20,
      entries: [
        ...Array.from({ length: 19 }, (_, index) => ({
          ...gateFurnitureEntry,
          entryId: `entry-spacer-${index}`,
          meaningOrdinal: index + 1,
          translation: null,
          wordDetails: undefined,
          capabilities: [],
        })),
        { ...withReport(gateFinanceEntry), meaningOrdinal: 20 },
      ],
    } : multi;
    await page.route("**/api/platform/v2/lookup", async route => {
      const request = route.request().postDataJSON();
      lookups.push(request.entryId);
      expect(request.query).toBeUndefined();
      await route.fulfill({ json: {
        contractVersion: "platform-lookup-v2", query: "bank",
        request: { ...request, contentLanguageCode: "nl", translationTargetLanguageCode: null },
        groups: [request.entryId === gateFurnitureEntry.entryId ? single : selectedGroup],
        page: { selectedTierComplete: true, nextGroupCursor: null },
      } });
    });
    await page.goto(`/dev/sense-card-gate?prototype=details&size=${size}${viewport.width < 1024 ? "&wrapper=drawer" : ""}`);
    if (colorScheme === "dark") await page.evaluate(() => document.documentElement.classList.add("dark"));
    await expect(page.getByTestId("library-sense-card-group")).toBeVisible();
    await expect(page.getByTestId("library-sense-card-group").getByRole("heading", { level: 2 })).toHaveCSS("font-size", regularHeadwordSize[size]);
    await expectReviewedHeaderGeometry(page);
    await expect(page.locator("[data-entry-id]")).toHaveCount(1);
    if (viewport.width < 1024) {
      const close = page.getByRole("button", { name: "Sluiten", exact: true });
      const translate = page.getByRole("button", { name: "Vertalen", exact: true });
      const closeBox = await close.boundingBox();
      const translateBox = await translate.boundingBox();
      expect(closeBox && translateBox).toBeTruthy();
      if (closeBox && translateBox) {
        const overlap = Math.min(closeBox.x + closeBox.width, translateBox.x + translateBox.width) > Math.max(closeBox.x, translateBox.x)
          && Math.min(closeBox.y + closeBox.height, translateBox.y + translateBox.height) > Math.max(closeBox.y, translateBox.y);
        expect(overlap).toBe(false);
      }
    }
    const copy = page.getByRole("button", { name: "Kopieer naar mijn woordenboek", exact: true });
    const report = page.getByRole("button", { name: /Melden|Report/, exact: true });
    await expect(copy).toBeInViewport({ ratio: 1 });
    await expect(report).toBeInViewport({ ratio: 1 });
    const copyBox = await copy.boundingBox();
    const reportBox = await report.boundingBox();
    expect(copyBox && reportBox).toBeTruthy();
    if (copyBox && reportBox) {
      const overlap = Math.min(copyBox.x + copyBox.width, reportBox.x + reportBox.width) > Math.max(copyBox.x, reportBox.x)
        && Math.min(copyBox.y + copyBox.height, reportBox.y + reportBox.height) > Math.max(copyBox.y, reportBox.y);
      expect(overlap).toBe(false);
    }
    await copy.click();
    await expect(page.getByTestId("copied-entry")).toHaveText(gateFurnitureEntry.entryId);
    await page.getByRole("button", { name: "Multi group", exact: true }).click();
    await expect(page.locator("[data-entry-id]")).toHaveCount(selectedGroup.entryCount);
    await expect(page.getByTestId(`library-sense-card-${gateFinanceEntry.entryId}`).getByRole("button", { name: /betekenis inklappen/i })).toBeVisible();
    await copy.click();
    await expect(page.getByTestId("copied-entry")).toHaveText(gateFinanceEntry.entryId);
    await page.getByRole("button", { name: "Toggle Training Details", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sluiten", exact: true })).toBeVisible();
    await expect(page.getByTestId("library-details-actions")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Melden", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Later oefenen (F)", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Verbergen voor training (X)", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Kopieer naar mijn woordenboek", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Vertalen", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Afspelen", exact: true })).toBeVisible();
    await expectReviewedHeaderGeometry(page);
    await expect(page.getByTestId(`library-sense-card-${gateFinanceEntry.entryId}`).getByTestId("library-sense-card-lead")).toBeInViewport();
    const lead = await page.getByTestId(`library-sense-card-${gateFinanceEntry.entryId}`).getByTestId("library-sense-card-lead").boundingBox();
    const scroller = page.getByTestId("library-sense-card-scroll-region");
    const scrollBox = await scroller.boundingBox();
    const topInset = await scroller.evaluate(node => node.scrollTop > 2 ? Math.min(44, node.clientHeight / 4) : 0);
    expect(lead!.y).toBeGreaterThanOrEqual(scrollBox!.y + topInset);
    // On a short drawer, decorative fades must leave at least half of the
    // reading region unobscured, without reducing the chosen text size.
    for (const fade of await page.locator("[data-scroll-affordance]").all()) {
      const fadeBox = await fade.boundingBox();
      expect(fadeBox!.height).toBeLessThanOrEqual(scrollBox!.height / 4 + 1);
    }
    expect(lookups).toContain(gateFurnitureEntry.entryId);
    expect(lookups).toContain(gateFinanceEntry.entryId);
    await page.getByRole("button", { name: "Sluiten", exact: true }).click();
    await expect(page.getByTestId(`library-sense-card-${gateFinanceEntry.entryId}`)).toHaveAttribute("data-expanded", "true");
    await page.getByRole("button", { name: "Toggle Training Details", exact: true }).click();
    await expect(page.getByTestId(`library-sense-card-${gateFinanceEntry.entryId}`)).toHaveAttribute("data-expanded", "true");
    await page.screenshot({ path: testInfo.outputPath(`details-training-more-${viewport.width}-${size}-${colorScheme}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
  }
  }
}

for (const viewport of viewports) {
  for (const size of readingSizes) {
  for (const colorScheme of colorSchemes) {
  test(`long Word Details header stays separate at ${viewport.width} ${size} ${colorScheme}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme });
    await page.route("**/api/platform/v2/lookup", async route => {
      const request = route.request().postDataJSON();
      await route.fulfill({ json: {
        contractVersion: "platform-lookup-v2", query: gateLongHeadwordGroup.header.text,
        request: { ...request, contentLanguageCode: "nl", translationTargetLanguageCode: null },
        groups: [gateLongHeadwordGroup],
        page: { selectedTierComplete: true, nextGroupCursor: null },
      } });
    });
    await page.goto(`/dev/sense-card-gate?prototype=details&fixture=long&size=${size}${viewport.width < 1024 ? "&wrapper=drawer" : ""}`);
    if (colorScheme === "dark") await page.evaluate(() => document.documentElement.classList.add("dark"));
    const headword = page.getByRole("heading", { name: gateLongHeadwordGroup.header.displayPronunciation! });
    await expect(headword).toBeVisible();
    await expect(headword).toHaveCSS(
      "font-size",
      viewport.width >= 640 ? longHeadwordSize.desktop[size] : longHeadwordSize.mobile[size],
    );
    await expectReviewedHeaderGeometry(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`details-long-${viewport.width}-${size}-${colorScheme}.png`) });
  });
  }
  }
}
