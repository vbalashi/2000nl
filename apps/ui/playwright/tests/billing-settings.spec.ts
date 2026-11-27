import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";

for (const profile of [{ width: 1050, height: 790 }, { width: 360, height: 780 }]) {
  test(`billing settings expose plan and Paddle actions at ${profile.width}px`, async ({ page }, testInfo) => {
    const mobile = profile.width < 700;
    await page.setViewportSize(profile);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/api/billing/sandbox", route => route.fulfill({ json: { checkoutReady: true } }));
    await page.route("**/api/billing/sandbox/access", route => route.fulfill({ json: {
      access: { active: true, plan: "year", validUntil: "2027-11-27T12:00:00Z", endsAfterCancel: false },
      nextPaymentAt: "2027-11-27T12:00:00Z", cancelAt: null, pastDue: false,
      actions: { details: true, payment: true, cancel: true },
    } }));
    await setupAuthenticatedTrainingAttributionPage(page, 0, {
      visualProfile: "answer",
      settingsOverrides: { preferences: { onboardingCompleted: true, onboardingLanguage: "en" } },
    });
    await page.getByTestId("app-header").getByRole("button", { name: "Settings", exact: true }).click();
    const menu = page.getByRole("navigation", { name: mobile ? "Mobile settings sections" : "Settings sections", exact: true });
    await menu.getByRole("button", { name: "Billing & subscriptions", exact: true }).click();
    const billing = page.getByRole("region", { name: "Premium", exact: true });
    await expect(billing.getByText("Next payment")).toBeVisible();
    await expect(billing.getByText("November 27, 2027")).toBeVisible();
    for (const label of ["Details and invoices", "Change payment method", "Cancel subscription"]) {
      const action = billing.getByRole("button", { name: label, exact: true });
      await expect(action).toBeVisible();
      const box = await action.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(48);
      expect(box && box.x + box.width).toBeLessThanOrEqual(profile.width);
    }
    await page.screenshot({ path: testInfo.outputPath("billing-settings.png") });
  });
}
