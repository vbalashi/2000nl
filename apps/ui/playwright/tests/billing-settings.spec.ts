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

for (const profile of [{ width: 1050, height: 790 }, { width: 360, height: 780 }]) {
  test(`Free learner opens and leaves checkout plans inside settings at ${profile.width}px`, async ({ page }, testInfo) => {
    const mobile = profile.width < 700;
    let paid = false;
    await page.setViewportSize(profile);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/api/billing/sandbox", route => route.fulfill({ json: {
      clientToken: "test_billing", prices: { month: "monthly", year: "yearly" }, checkoutReady: true, fulfillment: true,
    } }));
    await page.route("**/api/billing/sandbox/access", route => route.fulfill({ json: {
      access: paid
        ? { active: true, plan: "month", validUntil: "2027-11-27T12:00:00Z", endsAfterCancel: false }
        : { active: false },
      nextPaymentAt: null, cancelAt: null, pastDue: false,
      actions: { details: paid, payment: paid, cancel: paid },
    } }));
    await page.route("https://cdn.paddle.com/paddle/v2/paddle.js", route => route.fulfill({
      contentType: "application/javascript",
      body: `window.Paddle = {
        Environment: { set() {} }, Initialize() {},
        async PricePreview({ items }) {
          return { data: { details: { lineItems: items.map(({ priceId }) => ({
            price: { id: priceId }, formattedTotals: { total: priceId === "monthly" ? "€6.00" : "€60.00" }
          })) } } };
        },
        Checkout: { open() {} }
      };`,
    }));
    await page.route("**/api/billing/sandbox/transaction", route => {
      const request = route.request().postDataJSON();
      if (request.plan === "month") return route.fulfill({ json: { transactionId: "txn_mock", receipt: "mock-receipt" } });
      expect(request).toEqual({ receipt: "mock-receipt" });
      paid = true;
      return route.fulfill({ json: { status: "completed" } });
    });
    await setupAuthenticatedTrainingAttributionPage(page, 0, {
      visualProfile: "answer",
      settingsOverrides: { preferences: { onboardingCompleted: true, onboardingLanguage: "en" } },
    });
    await page.getByTestId("app-header").getByRole("button", { name: "Settings", exact: true }).click();
    const menu = page.getByRole("navigation", { name: mobile ? "Mobile settings sections" : "Settings sections", exact: true });
    await menu.getByRole("button", { name: "Billing & subscriptions", exact: true }).click();
    const entryUrl = page.url();
    const documentRequests: string[] = [];
    page.on("request", request => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests.push(request.url());
    });

    const explore = page.getByRole("button", { name: "Explore plans", exact: true });
    await expect(explore).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("free-subscription.png") });

    await explore.click();
    const plans = page.getByRole("heading", { name: "Premium plans", exact: true });
    await expect(plans).toBeFocused();
    await expect(page.getByRole("radio", { name: /Monthly/ })).toBeEnabled();
    await expect(page).toHaveURL(entryUrl);
    await page.screenshot({ path: testInfo.outputPath("inline-premium-plans.png") });
    await page.getByRole("button", { name: "Back to subscription", exact: true }).click();
    await expect(explore).toBeFocused();
    await expect(page.getByRole("heading", { name: "Free", exact: true })).toBeVisible();

    await explore.click();
    await page.getByRole("radio", { name: /Monthly/ }).check();
    await page.getByRole("button", { name: "Continue to test checkout" }).click();
    await page.getByRole("button", { name: "Check test payment" }).click();
    await expect(page.getByRole("status").filter({ hasText: /Paddle confirmed the test payment/ })).toBeVisible();
    await page.getByRole("button", { name: "Back to subscription", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Premium", exact: true })).toBeVisible();
    await expect(page).toHaveURL(entryUrl);
    expect(documentRequests).toEqual([]);
  });
}
