import { expect, test } from "@playwright/test";

// Pen 30.95.08 / twUIm, M2/M3/M6, accepted 2026-09-06 in #251.
// #249 revision 2: owner-requested article correction preserves a 1:2 ratio on both sides.
// The existing dev gate renders the real card with deterministic data: no login or DB writes.
for (const colorScheme of ["light", "dark"] as const) {
  test(`Answer preserves the measured reading hierarchy (${colorScheme})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 402, height: 874 });
    await page.emulateMedia({ colorScheme });
    await page.goto("/dev/sense-card-gate");
    await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), colorScheme === "dark");
    const fixture = page.locator('[data-gate-fixture="SC-01/02"]');
    const stage = fixture.getByTestId("training-sense-card-stage");
    await expect(stage).toHaveAttribute("data-side", "face");
    const lockup = stage.getByTestId("sense-card-headword-lockup");
    await expect(lockup.getByRole("heading")).toHaveCSS("font-size", "48px");
    await expect(lockup.getByText("de", { exact: true })).toHaveCSS("font-size", "24px");

    await stage.getByRole("button", { name: "Antwoord tonen" }).click();
    await expect(stage).toHaveAttribute("data-side", "answer");
    await expect(lockup.getByRole("heading")).toHaveCSS("font-size", "44px");
    await expect(lockup.getByText("de", { exact: true })).toHaveCSS("font-size", "22px");
    const headerActions = stage.getByTestId("training-answer-header-actions");
    const gap = await headerActions.evaluate((actions) => {
      const metadata = actions.parentElement!;
      const word = metadata.nextElementSibling!;
      return word.getBoundingClientRect().top - metadata.getBoundingClientRect().bottom;
    });
    expect(gap).toBeCloseTo(8, 1);
    const examples = stage.locator('[data-section="examples"]');
    const example = examples.locator('[data-content-kind="example"] > div > p').first();
    await expect(example).toHaveCSS("font-size", "16px");
    await expect(example).toHaveCSS("line-height", "22.4px");
    await expect(examples.getByTestId("sense-section-header").locator("svg")).toBeVisible();
    await expect(examples.locator('[data-content-kind="example"]').first()).toHaveCSS("border-left-width", "3px");
    await expect(stage.getByTestId("training-sense-card-dock")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await testInfo.attach("font-loading", {
      body: JSON.stringify(await page.evaluate(() => Array.from(document.fonts).map(
        ({ family, style, status }) => ({ family, style, status }),
      )), null, 2),
      contentType: "application/json",
    });
    await stage.screenshot({ path: testInfo.outputPath(`answer-${colorScheme}.png`) });
  });
}
