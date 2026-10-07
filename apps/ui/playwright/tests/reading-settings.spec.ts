import { expect, test, type BrowserContext } from "@playwright/test";

// The actual Settings → repository → Training components, with only the
// external Supabase transport replaced. DB/RLS has separate migration tests.
test("saved device profiles affect the real card independently and preserve its side", async ({ browser }, testInfo) => {
  const stored = { reading_size_phone: "normal", reading_size_desktop: "normal" };
  const writes: unknown[] = [];
  const installSettingsRoute = async (context: BrowserContext) => {
    await context.route(/^http:\/\/(localhost|127\.0\.0\.1):54321\//, async (route) => {
      if (!new URL(route.request().url()).pathname.endsWith("/rest/v1/user_settings")) return route.abort();
      if (route.request().method() === "POST") {
        const payload = route.request().postDataJSON();
        writes.push(payload);
        Object.assign(stored, payload);
        return route.fulfill({ status: 201, body: "" });
      }
      return route.fulfill({ json: stored });
    });
  };
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await Promise.all([installSettingsRoute(mobileContext), installSettingsRoute(desktopContext)]);
  const mobile = await mobileContext.newPage();
  const desktop = await desktopContext.newPage();
  const url = "/dev/sense-card-gate?prototype=reading-settings&fixture=long";

  await mobile.goto(url);
  await expect(mobile.locator("[data-reading-device='phone']")).toBeVisible();
  await mobile.getByRole("button", { name: "Antwoord tonen", exact: true }).click();
  const mobileStage = mobile.getByTestId("training-sense-card-stage");
  const mobileHeadword = mobileStage.getByRole("heading", { level: 2 });
  await expect(mobileHeadword).toHaveCSS("font-size", "44px");
  await mobile.getByRole("button", { name: /Instellingen|Settings/ }).click();
  await mobile.getByRole("button", { name: "Large", exact: true }).click();
  await expect.poll(() => stored.reading_size_phone).toBe("largest");
  await expect(mobile.getByText("Saved", { exact: true })).toHaveCount(0);
  await mobile.screenshot({ path: testInfo.outputPath("phone-reading-settings.png") });
  await mobile.getByRole("button", { name: "Back to card" }).click();
  await expect(mobileStage).toHaveAttribute("data-side", "answer");
  await expect(mobileHeadword).toHaveCSS("font-size", "51.92px");

  await desktop.goto(url);
  await expect(desktop.locator("[data-reading-device='desktop']")).toBeVisible();
  await desktop.getByRole("button", { name: "Antwoord tonen", exact: true }).click();
  const desktopStage = desktop.getByTestId("training-sense-card-stage");
  const desktopHeadword = desktopStage.getByRole("heading", { level: 2 });
  await expect(desktopHeadword).toHaveCSS("font-size", "44px");
  await desktop.getByRole("button", { name: /Instellingen|Settings/ }).click();
  await desktop.getByRole("button", { name: "Larger", exact: true }).click();
  await expect.poll(() => stored.reading_size_desktop).toBe("large");
  await expect(desktop.getByText("Saved", { exact: true })).toHaveCount(0);
  await desktop.screenshot({ path: testInfo.outputPath("desktop-reading-settings.png") });
  await desktop.getByRole("button", { name: "Back to card" }).click();
  await expect(desktopStage).toHaveAttribute("data-side", "answer");
  await expect(desktopHeadword).toHaveCSS("font-size", "47.52px");

  expect(writes).toEqual([
    { user_id: "00000000-0000-4000-8000-000000000265", reading_size_phone: "largest" },
    { user_id: "00000000-0000-4000-8000-000000000265", reading_size_desktop: "large" },
  ]);

  await mobile.reload();
  await expect(mobile.locator("[data-reading-device='phone']")).toBeVisible();
  await mobile.getByRole("button", { name: /Instellingen|Settings/ }).click();
  await expect(mobile.getByRole("group", { name: "Text size" }).getByRole("button", { name: "Large", exact: true })).toHaveAttribute("aria-pressed", "true");
  await desktop.reload();
  await expect(desktop.locator("[data-reading-device='desktop']")).toBeVisible();
  await desktop.getByRole("button", { name: /Instellingen|Settings/ }).click();
  await expect(desktop.getByRole("group", { name: "Text size" }).getByRole("button", { name: "Larger", exact: true })).toHaveAttribute("aria-pressed", "true");
  await mobileContext.close();
  await desktopContext.close();
});
