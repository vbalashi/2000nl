import { expect, test } from "@playwright/test";
import { assertTestFontsReady } from "../utils/assertTestFontsReady";
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

async function practiceHeadwordRoleSize(element: import("@playwright/test").Locator) {
  return element.evaluate((headword) => {
    const probe = document.createElement("span");
    probe.style.fontSize = "var(--practice-text-headword, 36px)";
    headword.parentElement!.append(probe);
    const size = getComputedStyle(probe).fontSize;
    probe.remove();
    return size;
  });
}

async function expectReviewedHeaderGeometry(
  page: import("@playwright/test").Page,
  options: { checkVerticalSpacing?: boolean } = {},
) {
  const row = page.getByTestId("sense-card-header-row");
  const metadata = row.getByTestId("sense-card-metadata");
  const actions = row.getByTestId("sense-card-header-actions");
  const translate = actions.getByRole("button", { name: "Vertalen", exact: true });
  const audio = actions.getByRole("button", { name: "Afspelen", exact: true });
  const lockup = page.getByTestId("sense-card-headword-lockup");
  const headword = lockup.getByRole("heading", { level: 2 });
  const header = page.getByTestId("library-sense-card-group").locator(":scope > header");

  await expect(row).toHaveCount(1);
  await expect(audio).toHaveCount(1);
  await expect(translate).toHaveCount(1);

  const [headerBox, lockupBox, rowBox, metadataBox, actionsBox, translateBox, audioBox, headwordBox] = await Promise.all([
    header.boundingBox(), lockup.boundingBox(), row.boundingBox(), metadata.boundingBox(), actions.boundingBox(), translate.boundingBox(), audio.boundingBox(), headword.boundingBox(),
  ]);
  expect(headerBox && lockupBox && rowBox && metadataBox && actionsBox && translateBox && audioBox && headwordBox).toBeTruthy();
  const expectedHorizontalPadding = page.viewportSize()!.width >= 640 ? 28 : 16;
  expect(rowBox!.x - headerBox!.x).toBeCloseTo(expectedHorizontalPadding, 0);
  expect(headerBox!.x + headerBox!.width - (rowBox!.x + rowBox!.width)).toBeCloseTo(expectedHorizontalPadding, 0);
  await expect(headword).toBeVisible();
  const { headerScrollTop, headerIsScrollable } = await header.evaluate(element => ({
    headerScrollTop: element.scrollTop,
    headerIsScrollable: element.scrollHeight > element.clientHeight + 1,
  }));
  if (options.checkVerticalSpacing !== false && headerScrollTop === 0 && !headerIsScrollable) {
    expect(rowBox!.y - headerBox!.y).toBe(16);
    expect(headerBox!.y + headerBox!.height - (lockupBox!.y + lockupBox!.height)).toBeCloseTo(20, 0);
  }
  expect(actionsBox!.x + actionsBox!.width).toBe(rowBox!.x + rowBox!.width);
  expect(actionsBox!.x - (metadataBox!.x + metadataBox!.width)).toBeGreaterThanOrEqual(11.5);
  expect(translateBox!.width).toBeCloseTo(32, 0);
  expect(translateBox!.height).toBeCloseTo(32, 0);
  expect(audioBox!.width).toBeCloseTo(32, 0);
  expect(audioBox!.height).toBeCloseTo(32, 0);
  await expect(translate).toHaveCSS("border-radius", "50%");
  await expect(audio).toHaveCSS("border-radius", "50%");
  await expect(translate.locator("svg")).toHaveCSS("width", "16px");
  await expect(translate.locator("svg")).toHaveCSS("height", "16px");
  await expect(audio.locator("svg")).toHaveCSS("width", "16px");
  await expect(audio.locator("svg")).toHaveCSS("height", "16px");
  expect(translateBox!.x - (audioBox!.x + audioBox!.width)).toBe(8);
  // A stacked article is the first line of the headword lockup.
  if (options.checkVerticalSpacing !== false && headerScrollTop === 0 && !headerIsScrollable) {
    const wordRow = await headword.evaluate(el => el.parentElement!.getBoundingClientRect().top);
    const rowToHeadwordGap = wordRow - (rowBox!.y + rowBox!.height);
    expect(rowToHeadwordGap).toBeGreaterThanOrEqual(11.5);
    expect(rowToHeadwordGap).toBeLessThanOrEqual(12.5);
  }
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
    await assertTestFontsReady(page);
    if (colorScheme === "dark") await page.evaluate(() => document.documentElement.classList.add("dark"));
    await expect(page.getByTestId("library-sense-card-group")).toBeVisible();
    const headword = page.getByTestId("library-sense-card-group").getByRole("heading", { level: 2 });
    const roleSize = await practiceHeadwordRoleSize(headword);
    await expect(headword).toHaveCSS("font-size", roleSize);
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
    await expect(page.getByRole("button", { name: "Kopieer naar mijn woordenboek", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Multi group", exact: true }).click();
    await expect(page.locator("[data-entry-id]")).toHaveCount(selectedGroup.entryCount);
    await expect(page.getByTestId(`library-sense-card-${gateFinanceEntry.entryId}`).getByRole("button", { name: /betekenis inklappen/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Meer kaartacties", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Kopieer naar mijn woordenboek", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Toggle Training Details", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sluiten", exact: true })).toBeVisible();
    await expect(page.getByTestId("library-details-actions")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Melden", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Later oefenen (F)", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Verbergen voor training (X)", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Kopieer naar mijn woordenboek", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Vertalen", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Afspelen", exact: true })).toBeVisible();
    await expectReviewedHeaderGeometry(page, { checkVerticalSpacing: false });
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
    await assertTestFontsReady(page);
    if (colorScheme === "dark") await page.evaluate(() => document.documentElement.classList.add("dark"));
    const headword = page.getByRole("heading", { name: gateLongHeadwordGroup.header.text });
    await expect(headword).toBeVisible();
    const fittedSize = await headword.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    const roleSize = parseFloat(await practiceHeadwordRoleSize(headword));
    expect(fittedSize).toBeGreaterThanOrEqual(20);
    expect(fittedSize).toBeLessThanOrEqual(roleSize);
    await expectReviewedHeaderGeometry(page);
    const header = page.getByTestId("library-sense-card-group").locator(":scope > header");
    const headerIsScrollable = await header.evaluate(element => element.scrollHeight > element.clientHeight + 1);
    if (headerIsScrollable) {
      await expect(header).toHaveAttribute("tabindex", "0");
      await header.press("End");
      await expect.poll(async () => {
        const [headerBox, wordBox] = await Promise.all([header.boundingBox(), headword.boundingBox()]);
        return wordBox!.y >= headerBox!.y && wordBox!.y + wordBox!.height <= headerBox!.y + headerBox!.height;
      }).toBe(true);
      await header.press("Home");
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`details-long-${viewport.width}-${size}-${colorScheme}.png`) });
    await page.getByRole("button", { name: "Toggle Training Details", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sluiten", exact: true })).toBeVisible();
    await expectReviewedHeaderGeometry(page, { checkVerticalSpacing: false });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`details-long-training-more-${viewport.width}-${size}-${colorScheme}.png`) });
  });
  }
  }
}
