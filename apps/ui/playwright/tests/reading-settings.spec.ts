import { expect, test } from "@playwright/test";

// The actual Settings → repository → Training components, with only the
// external Supabase transport replaced. DB/RLS has separate migration tests.
test("saved device profiles affect the real card independently and preserve its side", async ({ page }, testInfo) => {
  const stored = { reading_size_phone: "normal", reading_size_desktop: "normal" };
  const writes: unknown[] = [];
  await page.route("http://localhost:54321/**", async (route) => {
    if (!new URL(route.request().url()).pathname.endsWith("/rest/v1/user_settings")) return route.abort();
    if (route.request().method() === "POST") {
      const payload = route.request().postDataJSON();
      writes.push(payload);
      Object.assign(stored, payload);
      return route.fulfill({ status: 201, body: "" });
    }
    return route.fulfill({ json: stored });
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/dev/sense-card-gate?prototype=reading-settings&fixture=long");
  await page.getByRole("button", { name: "Antwoord tonen", exact: true }).click();
  const stage = page.getByTestId("training-sense-card-stage");
  const headword = stage.getByRole("heading", { level: 2 });
  await expect(headword).toHaveCSS("font-size", "44px");
  await page.getByRole("button", { name: /Instellingen|Settings/ }).click();
  await page.getByRole("combobox", { name: "Phone text size", exact: true }).selectOption("largest");
  await expect(page.getByText("Saved", { exact: true })).toHaveCount(1);
  await page.getByRole("combobox", { name: "Computer / tablet text size", exact: true }).selectOption("large");
  await expect(page.getByText("Saved", { exact: true })).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath("desktop-reading-settings.png") });
  await page.getByRole("button", { name: "Back to card" }).click();
  await expect(stage).toHaveAttribute("data-side", "answer");
  await expect(headword).toHaveCSS("font-size", "46px");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(headword).toHaveCSS("font-size", "46px");
  await page.getByRole("button", { name: /Instellingen|Settings/ }).click();
  await expect(page.getByRole("combobox", { name: "Profile for this browser", exact: true })).toHaveValue("desktop");
  await page.getByRole("combobox", { name: "Profile for this browser", exact: true }).selectOption("phone");
  await page.screenshot({ path: testInfo.outputPath("phone-reading-settings.png") });
  await page.getByRole("button", { name: "Back to card" }).click();
  await expect(headword).toHaveCSS("font-size", "48px");
  await expect(stage).toHaveAttribute("data-side", "answer");
  expect(writes).toEqual([
    { user_id: "00000000-0000-4000-8000-000000000265", reading_size_phone: "largest" },
    { user_id: "00000000-0000-4000-8000-000000000265", reading_size_desktop: "large" },
  ]);
  await page.reload();
  await page.getByRole("button", { name: /Instellingen|Settings/ }).click();
  await expect(page.getByRole("combobox", { name: "Profile for this browser", exact: true })).toHaveValue("phone");
  await expect(page.getByRole("combobox", { name: "Phone text size", exact: true })).toHaveValue("largest");
  await expect(page.getByRole("combobox", { name: "Computer / tablet text size", exact: true })).toHaveValue("large");
});
