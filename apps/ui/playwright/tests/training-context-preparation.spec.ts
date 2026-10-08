import { expect, test } from "@playwright/test";
for (const mode of ["light", "dark"] as const) test(`pending context uses shared motion and preserves retry (${mode})`, async ({page},testInfo) => {
  await page.setViewportSize({width:857,height:1235});
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.goto(`/dev/sense-card-gate?prototype=session-states&state=context-pending&language=en&mode=${mode}`);
  const state=page.getByTestId("training-session-state");
  await expect(state).toHaveAttribute("aria-busy","true");
  await expect(page.getByText("Preparing this sentence translation…")).toBeVisible();
  const dot=page.getByTestId("loading-indicator").locator("i").first();
  expect(await dot.evaluate(el=>getComputedStyle(el).animationName)).not.toBe("none");
  const retry=page.getByRole("button",{name:"Try again",exact:true});
  await expect(retry).toBeInViewport({ratio:1});
  await page.screenshot({path:testInfo.outputPath(`context-pending-${mode}.png`)});
  await page.emulateMedia({reducedMotion:"reduce"});
  expect(await dot.evaluate(el=>getComputedStyle(el).animationName)).toBe("none");
  await retry.click();
  await expect(page.locator("output")).toHaveText("retried");
});
