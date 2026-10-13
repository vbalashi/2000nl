import { test, expect } from "@playwright/test";
test("real browser tabs receive one public invalidation with BroadcastChannel or storage fallback", async ({
  browser,
}) => {
  for (const fallback of [false, true]) {
    const context = await browser.newContext();
    if (fallback)
      await context.addInitScript(() => {
        Object.defineProperty(window, "BroadcastChannel", {
          value: undefined,
          configurable: true,
        });
      });
    const first = await context.newPage(),
      second = await context.newPage();
    await first.goto("/dev/sense-card-gate?prototype=translation-tab-sync");
    await second.goto("/dev/sense-card-gate?prototype=translation-tab-sync");
    await expect(first.getByTestId("received")).toHaveText("0");
    await expect(second.getByTestId("received")).toHaveText("0");
    await first.getByRole("button", { name: "Complete translation" }).click();
    await expect(first.getByTestId("received")).toHaveText("1");
    await expect(second.getByTestId("received")).toHaveText("1");
    await second.getByRole("button", { name: "Complete translation" }).click();
    await expect(first.getByTestId("received")).toHaveText("2");
    await expect(second.getByTestId("received")).toHaveText("2");
    await context.close();
  }
});
