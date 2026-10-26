import { test, expect } from "@playwright/test";
test("owner selects one request and sees an audited-style batch result", async ({ page }) => {
  const items = ["anna@example.test", "olesia@example.test"].map(email => ({ email, status: "pending", user_id: null, created_at: "2026-10-26T10:00:00Z", updated_at: "2026-10-26T10:00:00Z" }));
  await page.route("**/api/admin/session", route => route.fulfill({ json: { email: "owner@example.test", permissions: ["users.read", "admission.manage"] } }));
  await page.route("**/api/admin/users?**", route => route.fulfill({ json: { items: [], hasNext: false, page: 1, pageSize: 25, returned: 0 } }));
  const decisions: unknown[] = [];
  await page.route("**/api/admin/admission**", route => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON(); decisions.push(body);
      if (body.action === "approve") for (const item of items) if (body.emails.includes(item.email)) item.status = "approved";
      return route.fulfill({ json: { results: [{ outcome: "changed" }] } });
    }
    return route.fulfill({ json: { items: items.filter(item => item.status === "pending"), enabled: true, mode: "approval-required", page: 1 } });
  });
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "Допуск пользователей" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Выбрать anna@example.test" }).check();
  await page.getByRole("button", { name: "Одобрить выбранных (1)" }).click();
  await expect(page.getByRole("status")).toContainText("Изменено: 1");
  expect(decisions).toEqual([{ action: "approve", emails: ["anna@example.test"], mode: "approval-required" }]);
  await page.screenshot({ path: "/tmp/2000nl-admission-762/admin-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Допуск пользователей" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/2000nl-admission-762/admin-mobile.png", fullPage: true });
});
