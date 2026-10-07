import { expect, test } from "@playwright/test";
import { assertTestFontsReady } from "../utils/assertTestFontsReady";

// Current account-scale Training roles are shared by Face and Answer (#407).
// Keep M2's 8px gap and check literary copy against its current semantic role.
// The existing dev gate renders the real card with deterministic data: no login or DB writes.
for (const colorScheme of ["light", "dark"] as const) {
  test(`Training preserves the display-role reading hierarchy (${colorScheme})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 402, height: 874 });
    await page.emulateMedia({ colorScheme });
    await page.goto("/dev/sense-card-gate");
    await assertTestFontsReady(page);
    await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), colorScheme === "dark");
    const fixture = page.locator('[data-gate-fixture="SC-01/02"]');
    const stage = fixture.getByTestId("training-sense-card-stage");
    const displaySize = await stage.evaluate((el) => getComputedStyle(el).getPropertyValue("--practice-text-display").trim());
    await expect(stage).toHaveAttribute("data-side", "face");
    const lockup = stage.getByTestId("sense-card-headword-lockup");
    await expect(lockup.getByRole("heading")).toHaveCSS("font-size", displaySize);
    await expect(lockup.getByText("de", { exact: true })).toHaveCSS("font-size", `${Number.parseFloat(displaySize) / 2}px`);

    await stage.getByRole("button", { name: "Antwoord tonen" }).click();
    await expect(stage).toHaveAttribute("data-side", "answer");
    await expect(lockup.getByRole("heading")).toHaveCSS("font-size", displaySize);
    await expect(lockup.getByText("de", { exact: true })).toHaveCSS("font-size", `${Number.parseFloat(displaySize) / 2}px`);
    const headerActions = stage.getByTestId("training-answer-header-actions");
    const gap = await headerActions.evaluate((actions) => {
      const metadata = actions.parentElement!;
      const word = metadata.nextElementSibling!;
      return word.getBoundingClientRect().top - metadata.getBoundingClientRect().bottom;
    });
    expect(gap).toBeCloseTo(8, 1);
    const examples = stage.locator('[data-section="examples"]');
    const example = examples.locator('[data-content-kind="example"] > div > p').first();
    const literaryRole = await example.evaluate((element) => {
      const probe = document.createElement("p");
      probe.style.fontSize = "var(--practice-literary-size, var(--practice-text-body-lg, 16px))";
      probe.style.lineHeight = "var(--practice-literary-leading, var(--practice-source-leading, 1.25))";
      element.parentElement!.append(probe);
      const style = getComputedStyle(probe);
      const result = { fontSize: style.fontSize, lineHeight: style.lineHeight };
      probe.remove();
      return result;
    });
    await expect(example).toHaveCSS("font-size", literaryRole.fontSize);
    await expect(example).toHaveCSS("line-height", literaryRole.lineHeight);
    // The current shared reader rail is 2px (the retired article-only rail was 3px).
    await expect(examples.locator('[data-content-kind="example"]').first()).toHaveCSS("border-left-width", "2px");
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
