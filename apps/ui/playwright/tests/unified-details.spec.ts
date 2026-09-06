import { expect, test } from "@playwright/test";
import { gateBankGroup, gateFinanceEntry, gateFurnitureEntry } from "../../lib/platform/fixtures/senseCardV1GateFixture";

const withReport = (entry: typeof gateFurnitureEntry) => ({ ...entry, reportContentRevision: "a".repeat(64) });
const single = {
  ...gateBankGroup, headwordGroupId: "bank-single",
  entries: [withReport(gateFurnitureEntry)], senseCount: 1, entryCount: 1,
};
const multi = {
  ...gateBankGroup, headwordGroupId: "bank-multi",
  entries: [withReport(gateFurnitureEntry), withReport(gateFinanceEntry)],
};

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1440, height: 960 }]) {
  for (const size of ["normal", "largest"] as const) {
  test(`unified single/multi Details and reachable footer at ${viewport.width} ${size}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: size === "largest" ? "dark" : "light" });
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
    if (size === "largest") await page.evaluate(() => document.documentElement.classList.add("dark"));
    await expect(page.getByTestId("library-sense-card-group")).toBeVisible();
    await expect(page.getByTestId("library-sense-card-group").getByRole("heading", { level: 2 })).toHaveCSS("font-size", size === "largest" ? "48px" : "44px");
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
    await expect(copy).toBeInViewport();
    await expect(report).toBeInViewport();
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
    await expect(page.getByRole("button", { name: "Later oefenen (F)", exact: true })).toBeInViewport();
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
    await expect(copy).toBeInViewport();
    await expect(report).toBeInViewport();
    expect(lookups).toContain(gateFurnitureEntry.entryId);
    expect(lookups).toContain(gateFinanceEntry.entryId);
    await page.screenshot({ path: testInfo.outputPath(`details-${viewport.width}-${size}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
  }
}
