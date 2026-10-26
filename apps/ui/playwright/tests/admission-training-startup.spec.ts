import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";

test("pending admission stops product loading and approval resumes startup", async ({ page }) => {
  // Unhandled requests must never reach a real account or database.
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.protocol === "http:" && url.hostname === "127.0.0.1" &&
      !url.pathname.startsWith("/api/") ? route.continue() : route.abort();
  });
  const productRequests: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/rest/v1/")) productRequests.push(path);
  });
  const { requests } = await setupAuthenticatedTrainingAttributionPage(page, 0, {
    admissionStatus: "pending", visualProfile: "answer",
  });
  await expect(page.getByRole("heading", {
    name: /Your access request is awaiting approval|Je aanvraag wacht op goedkeuring|Заявка ожидает одобрения/,
  })).toBeVisible();
  expect(productRequests).toEqual([]);
  expect(requests.sessionStarts).toHaveLength(0);
  await expect(page.getByRole("button", {
    name: /^(Start training|Training starten|Начать тренировку)$/,
  })).toHaveCount(0);

  await page.route("**/api/admission", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ enabled: true, status: "approved", mode: "approval-required" }),
  }));
  await page.getByRole("button", { name: /Check access|Toegang controleren|Проверить доступ/ }).click();
  await expect(page.getByRole("button", {
    name: /^(Start training|Training starten|Начать тренировку)$/,
  })).toBeVisible();
  expect(productRequests.length).toBeGreaterThan(0);
});
