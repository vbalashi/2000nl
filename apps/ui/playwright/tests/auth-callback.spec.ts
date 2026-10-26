import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";
import { buildFakeSupabaseSession, getSupabaseStorageKey } from "../utils/supabaseTestSession";

test("PKCE callback exchanges once and reaches the app without auth_failed", async ({ page }) => {
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    return url.protocol === "http:" && url.hostname === "127.0.0.1" && !url.pathname.startsWith("/api/")
      ? route.continue() : route.abort();
  });
  await setupAuthenticatedTrainingAttributionPage(page, 0, { deferNavigation: true, visualProfile: "answer" });
  let exchanges = 0;
  await page.route("**/auth/v1/token?grant_type=pkce", async route => {
    exchanges++;
    const body = route.request().postDataJSON();
    if (exchanges !== 1 || body.code_verifier !== "synthetic-verifier") {
      return route.fulfill({ status: 400, json: { error: "invalid_request", error_description: "code verifier already consumed" } });
    }
    await route.fulfill({ json: buildFakeSupabaseSession({ id: "training-attribution-user", email: "test@2000nl.test" }) });
  });
  await page.addInitScript(key => {
    localStorage.setItem(key + "-code-verifier", JSON.stringify("synthetic-verifier"));
  }, getSupabaseStorageKey());
  await page.goto("/auth/callback?code=synthetic-single-use-code");
  await expect(page.getByRole("button", { name: /^(Start training|Training starten|Начать тренировку)$/ })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("error")).toBeNull();
  expect(exchanges).toBe(1);
});
