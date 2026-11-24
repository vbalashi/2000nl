import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";

test("@pilot Known action retains its position after setup and restart", async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 780 });
  await setupAuthenticatedTrainingAttributionPage(page, 0, {
    visualProfile: "answer", useUuidEntryIds: true, useUuidSessionId: true,
    settingsOverrides: { preferences: { onboardingCompleted: true, onboardingLanguage: "en" } },
  });
  const start = page.getByRole("button", { name: /^Start training$/i });
  await start.click();
  const known = page.getByRole("button", { name: "Mark as known", exact: true });
  await expect(known).toBeVisible();
  const before = await known.boundingBox();
  let replaced = false;
  const snapshot = async (route: import("@playwright/test").Route) => {
    await route.fulfill({ json: {
      sessionId: route.request().postDataJSON().p_session_id,
      runStatus: replaced ? "superseded" : "active",
      runGeneration: replaced ? null : 1,
      sessionSize: "5", plannedNew: 5, plannedReview: 0, plannedPractice: 0,
      plannedTotal: 5, plannedAt: new Date().toISOString(),
      members: [{
        ordinal: 2, entryId: "known-sibling", cardTypeId: "definition-to-word",
        queueSource: "new", consumedAt: null, unavailableAt: new Date().toISOString(),
        unavailableReason: "known",
      }],
    } });
  };
  const url = "**/rpc/get_training_session_snapshot";
  await page.route(url, snapshot);
  const read = page.waitForResponse(response => response.url().includes("/rpc/get_training_session_snapshot"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await read;
  await expect(known).toBeEnabled();
  replaced = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(start).toBeVisible({ timeout: 8000 });
  await page.unroute(url, snapshot);
  await start.click();
  await expect(known).toBeVisible();
  await expect.poll(async () => (await known.boundingBox())?.y).toBe(before?.y);
});
