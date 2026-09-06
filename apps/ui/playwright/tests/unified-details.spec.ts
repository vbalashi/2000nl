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
  test(`unified single/multi Details and reachable footer at ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const lookups: string[] = [];
    await page.route("**/api/platform/v2/lookup", async route => {
      const request = route.request().postDataJSON();
      lookups.push(request.entryId);
      expect(request.query).toBeUndefined();
      await route.fulfill({ json: {
        contractVersion: "platform-lookup-v2", query: "bank",
        request: { ...request, contentLanguageCode: "nl", translationTargetLanguageCode: null },
        groups: [request.entryId === gateFurnitureEntry.entryId ? single : multi],
        page: { selectedTierComplete: true, nextGroupCursor: null },
      } });
    });
    await page.goto("/dev/sense-card-gate?prototype=details");
    await expect(page.getByTestId("library-sense-card-group")).toBeVisible();
    await expect(page.locator("[data-entry-id]")).toHaveCount(1);
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
    await expect(page.locator("[data-entry-id]")).toHaveCount(2);
    await expect(page.getByTestId(`library-sense-card-${gateFinanceEntry.entryId}`).getByRole("button", { name: /betekenis inklappen/i })).toBeVisible();
    await copy.click();
    await expect(page.getByTestId("copied-entry")).toHaveText(gateFinanceEntry.entryId);
    await page.getByRole("button", { name: "Toggle Training Details", exact: true }).click();
    await expect(page.getByRole("button", { name: "Later oefenen (F)", exact: true })).toBeInViewport();
    await expect(page.getByTestId(`library-sense-card-${gateFinanceEntry.entryId}`).getByTestId("library-sense-card-lead")).toBeInViewport();
    await expect(copy).toBeInViewport();
    await expect(report).toBeInViewport();
    expect(lookups).toContain(gateFurnitureEntry.entryId);
    expect(lookups).toContain(gateFinanceEntry.entryId);
    await page.screenshot({ path: testInfo.outputPath(`details-${viewport.width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
