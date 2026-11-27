import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";

test("Free Library search shows the trial balance before sending the first AI request", async ({ page }) => {
  const userId = "b764ef14-55c7-47ab-b691-8a962fccdfa0";
  let replies = 0;
  await page.route("**/api/library/card-assistant", route => {
    if (route.request().method() === "POST") {
      replies += 1;
      return route.fulfill({ json: { mode: "provider", message: "Mock answer", suggestions: [] } });
    }
    return route.fulfill({ json: {
      userId,
      allowed: true,
      allowances: { premium: false, manualUntil: null, aiRepliesRemaining: 2 - replies, dictationsRemaining: 10, personalMeaningsRemaining: 100 },
    } });
  });
  await page.route("**/api/library/search", route => {
    const request = route.request().postDataJSON();
    return route.fulfill({ json: {
      contractVersion: "platform-lookup-v2", query: request.query, request, groups: [],
      page: { selectedTierComplete: true, nextGroupCursor: null },
      librarySearch: { totalGroups: 0, totalMeanings: 0, matchingEntryIds: [] },
    } });
  });
  await page.route("**/api/library/category-search", route => {
    const { group } = route.request().postDataJSON();
    return route.fulfill({ json: { groups: [{
      id: group, total: 0, wordGroupCount: 0, items: [], page: { hasMore: false, nextCursor: null },
    }] } });
  });
  await setupAuthenticatedTrainingAttributionPage(page, 0, {
    userId, visualProfile: "answer",
    settingsOverrides: { preferences: { onboardingCompleted: true, onboardingLanguage: "en" } },
  });
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("textbox", { name: "Search words", exact: true }).fill("vooruitgang");
  await page.getByRole("button", { name: "Help find the meaning", exact: true }).click();
  await expect(page.getByText("Try Ask AI on Free.", { exact: true })).toBeVisible();
  await expect(page.getByText(/AI replies left: 2/)).toBeVisible();
  const composer = page.getByRole("complementary").locator("textarea");
  await expect(composer).toHaveValue(/vooruitgang/);
  expect(replies).toBe(0);
  await composer.press("Enter");
  await expect(page.getByText("Mock answer", { exact: true })).toBeVisible();
  await expect(page.getByText(/AI replies left: 1/)).toBeVisible();
});

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

for (const profile of [{ width: 1050, height: 790 }, { width: 360, height: 780 }, { width: 320, height: 720 }]) {
  test(`Free learner opens and leaves checkout plans inside settings at ${profile.width}px`, async ({ page }, testInfo) => {
    const mobile = profile.width < 700;
    let paid = false;
    let verificationAttempts = 0;
    await page.setViewportSize(profile);
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: mobile ? "dark" : "light" });
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
      body: `let activeCheckout;
      let notifyCheckout;
      window.Paddle = {
        Environment: { set() {} }, Initialize({ eventCallback }) {
          notifyCheckout = eventCallback;
          window.addEventListener("paddle-fixture-event", event => eventCallback(event.detail));
        },
        async PricePreview({ items }) {
          return { data: { details: { lineItems: items.map(({ priceId }) => ({
            price: { id: priceId }, formattedTotals: { total: priceId === "monthly" ? "€6.00" : "€60.00" }
          })) } } };
        },
        Checkout: {
          open({ transactionId, settings }) {
            const frame = document.createElement("iframe");
            frame.title = "Paddle test payment form";
            frame.dataset.paddleFixture = settings.displayMode;
            frame.dataset.checkoutTheme = settings.theme;
            frame.style.cssText = settings.frameStyle;
            frame.height = 340;
            const isDark = settings.theme === "dark";
            frame.srcdoc = '<style>body{font:16px system-ui;color:' + (isDark ? '#eee;background:#1e2033' : '#232535;background:#fff') +
              ';padding:12px;color-scheme:' + settings.theme + '}label{display:block;margin:12px 0}input{display:block;padding:8px;width:90%;box-sizing:border-box}</style>' +
              '<h2>Paddle Sandbox</h2><form><label>Email<input type="email" autocomplete="off"></label>' +
              '<label>Country<input type="text" value="Netherlands" readonly></label><p>Test mode. No real charge.</p></form>';
            document.getElementsByClassName(settings.frameTarget)[0].append(frame);
            activeCheckout = { transactionId, frame };
            if (transactionId === "txn_month") {
              notifyCheckout({ name: "checkout.loaded", data: { transaction_id: transactionId, currency_code: "EUR",
                totals: { subtotal: 4.8, tax: 1.2, total: 6, balance: 6 }, recurring_totals: { total: 6 } } });
            }
          },
          close() {
            const checkout = activeCheckout;
            activeCheckout = undefined;
            if (!checkout) return;
            checkout.frame.remove();
            notifyCheckout({ name: "checkout.closed", data: { transaction_id: checkout.transactionId, status: "draft" } });
          }
        }
      };`,
    }));
    await page.route("**/api/billing/sandbox/transaction", route => {
      const request = route.request().postDataJSON();
      if (request.plan) return route.fulfill({ json: { transactionId: "txn_" + request.plan, receipt: request.plan + "-receipt" } });
      expect(request).toEqual({ receipt: "year-receipt" });
      if (++verificationAttempts === 1) return route.fulfill({ json: { status: "pending" } });
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
    const plans = page.getByRole("heading", { name: "Your words. Your way.", exact: true });
    await expect(plans).toBeFocused();
    await expect(page.getByText("vooruitgang", { exact: true })).toHaveAttribute("lang", "nl");
    await expect(page.getByText("progress / moving forward", { exact: true })).toBeVisible();
    await expect(page.getByText("€6.00", { exact: true })).toBeVisible();
    await expect(page.getByText("€60.00", { exact: true })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Monthly/ })).toBeEnabled();
    await expect(page).toHaveURL(entryUrl);
    await page.screenshot({ path: testInfo.outputPath("inline-premium-plans.png") });
    const offer = page.getByRole("dialog", { name: "Your words. Your way.", exact: true });
    await expect(offer).toBeVisible();
    await offer.getByRole("button", { name: "Close", exact: true }).click();
    await expect(explore).toBeFocused();
    await expect(page.getByRole("heading", { name: "Free", exact: true })).toBeVisible();

    await explore.click();
    await page.getByRole("radio", { name: /Monthly/ }).check();
    await page.getByRole("button", { name: "Continue to test checkout" }).click();
    const emitPaddle = (name: string, transactionId: string, status: string) => page.evaluate(event => {
      window.dispatchEvent(new CustomEvent("paddle-fixture-event", { detail: event }));
    }, { name, data: { transaction_id: transactionId, status } });

    const frame = page.locator("iframe[data-paddle-fixture]");
    const summary = page.getByRole("region", { name: "Order summary" });
    await expect(frame).toBeVisible();
    await expect(frame).toHaveAttribute("data-paddle-fixture", "inline");
    await expect(frame).toHaveAttribute("data-checkout-theme", mobile ? "dark" : "light");
    await expect(summary.getByText("Monthly", { exact: true })).toBeVisible();
    await expect(summary.getByText("Tax", { exact: true })).toBeVisible();
    await expect(summary.getByText(/EUR\s+1\.20/)).toBeVisible();
    await expect(summary.getByText("Due today")).toBeVisible();
    await expect(summary.getByText("Total at renewal")).toBeVisible();
    const paymentFrame = await frame.boundingBox();
    expect(paymentFrame && paymentFrame.x + paymentFrame.width).toBeLessThanOrEqual(profile.width);
    await page.screenshot({ path: testInfo.outputPath("embedded-paddle-checkout.png"), fullPage: true });

    await page.getByRole("button", { name: "Change plan" }).click();
    await expect(frame).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Continue to test checkout" })).toBeFocused();
    await page.getByRole("radio", { name: /Yearly/i }).check();
    await page.clock.install();
    await page.getByRole("button", { name: "Continue to test checkout" }).click();
    await expect(summary.getByText("Yearly", { exact: true })).toBeVisible();
    await expect(frame).toHaveCount(1);
    const close = offer.getByRole("button", { name: "Close", exact: true });
    const verify = offer.getByRole("button", { name: "Check test payment" });
    await emitPaddle("checkout.payment.initiated", "txn_year", "ready");
    await expect(offer.getByRole("button", { name: "Change plan" })).toHaveCount(0);
    await expect(verify).toHaveCount(0);
    await expect(close).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(offer).toBeVisible();

    // The order summary never arrived for this session. A load timeout must retain the receipt.
    await page.clock.fastForward(20_001);
    await expect(verify).toBeVisible();
    await verify.click();
    await expect(close).toBeDisabled();
    await expect(offer.getByRole("status").filter({ hasText: /Paddle has not confirmed the payment yet/ })).toBeVisible();

    await emitPaddle("checkout.completed", "txn_year", "completed");
    await expect(close).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(offer).toBeVisible();
    await verify.click();
    await expect(page.getByRole("status").filter({ hasText: /Paddle confirmed the test payment/ })).toBeVisible();
    await emitPaddle("checkout.closed", "txn_year", "completed");
    await expect(frame).toHaveCount(0);
    await expect(close).toBeEnabled();
    await close.click();
    await expect(page.getByRole("heading", { name: "Premium", exact: true })).toBeVisible();
    await expect(page).toHaveURL(entryUrl);
    expect(documentRequests).toEqual([]);
  });
}

for (const profile of [{ width: 1050, height: 790 }, { width: 360, height: 780 }]) {
  test(`Ask AI opens Premium without closing the word draft at ${profile.width}px`, async ({ page }) => {
    const userId = "b764ef14-55c7-47ab-b691-8a962fccdfa0";
    let allowed = false;
    await page.setViewportSize(profile);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/api/library/card-assistant", route => {
      expect(route.request().method()).toBe("GET");
      return route.fulfill({ json: { userId, allowed } });
    });
    await page.route("**/api/billing/sandbox", route => route.fulfill({ status: 404 }));
    await setupAuthenticatedTrainingAttributionPage(page, 0, {
      userId,
      visualProfile: "answer",
      settingsOverrides: { preferences: { onboardingCompleted: true, onboardingLanguage: "en" } },
    });
    await page.getByRole("button", { name: "Library", exact: true }).click();
    await page.getByRole("button", { name: "Add your own word", exact: true }).click();
    await page.getByRole("button", { name: "Edit word", exact: true }).click();
    const word = page.getByRole("textbox", { name: "Edit word", exact: true });
    await word.fill("vooruitgang");
    await word.press("Enter");
    const askAi = page.getByRole("button", { name: "Ask AI", exact: true });
    const url = page.url();
    await askAi.click();
    const offer = page.getByRole("dialog", { name: "Your words. Your way.", exact: true });
    await expect(offer.getByText("vooruitgang", { exact: true })).toBeVisible();
    await expect(offer.getByText("Ask AI is a Premium feature.", { exact: true })).toBeVisible();
    allowed = true;
    const refreshed = page.waitForResponse("**/api/library/card-assistant");
    await offer.getByRole("button", { name: "Close", exact: true }).click();
    await refreshed;
    await expect(askAi).toBeFocused();
    await expect(page.getByRole("heading", { name: /vooruitgang/i })).toBeVisible();
    await expect(page).toHaveURL(url);
    await askAi.click();
    await expect(page.getByRole("button", { name: "Close assistant", exact: true })).toBeVisible();
    await expect(offer).toHaveCount(0);
  });
}
