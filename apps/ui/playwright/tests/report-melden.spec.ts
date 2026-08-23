import { expect, test, type Page } from "@playwright/test";
import {
  buildFakeSupabaseSession,
  installSupabaseSession,
} from "../utils/supabaseTestSession";

const testUser = {
  id: "99999999-9999-4999-8999-999999999999",
  email: "report-qa@2000nl.test",
};

async function installReportTestSession(page: Page) {
  await installSupabaseSession(page, buildFakeSupabaseSession(testUser));
}

async function outboxCount(page: Page) {
  return page.evaluate(() => new Promise<number>((resolve, reject) => {
    const open = indexedDB.open("2000nl-diagnostic-report-outbox", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const transaction = open.result.transaction("reports", "readonly");
      const count = transaction.objectStore("reports").count();
      count.onsuccess = () => resolve(count.result);
      count.onerror = () => reject(count.error);
    };
  }));
}

const profiles = [
  { name: "mobile-402x874", viewport: { width: 402, height: 874 } },
  { name: "mobile-390x844", viewport: { width: 390, height: 844 } },
  { name: "desktop", viewport: { width: 1280, height: 900 } },
] as const;

for (const profile of profiles) {
  test(`${profile.name} keeps one report action and one accessible sheet`, async ({ page }, testInfo) => {
    await page.setViewportSize(profile.viewport);
    await page.goto("/dev/sense-card-gate");
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    const fixture = page.locator('[data-gate-fixture="SC-01/02"]').first();
    await expect(fixture.getByRole("button", { name: "Melden" })).toHaveCount(1);
    await expect(fixture.getByRole("button", { name: /Melden:/ })).toHaveCount(0);

    const report = fixture.getByRole("button", { name: "Melden" });
    await report.click();
    const dialog = page.getByRole("dialog", { name: "Wat klopt er niet?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("radio")).toHaveCount(6);
    await expect(dialog.locator("textarea")).toBeVisible();
    const contextAfterComment = await dialog.evaluate((node) => {
      const textarea = node.querySelector("textarea");
      const context = node.querySelector("#sense-card-report-context");
      return Boolean(textarea && context && (textarea.compareDocumentPosition(context) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    expect(contextAfterComment).toBe(true);
    const back = dialog.getByRole("button", { name: "Terug" });
    const send = dialog.getByRole("button", { name: "Versturen" });
    const [backBox, sendBox] = await Promise.all([back.boundingBox(), send.boundingBox()]);
    expect(backBox).not.toBeNull();
    expect(sendBox).not.toBeNull();
    expect((sendBox?.width ?? 0) / (backBox?.width ?? 1)).toBeGreaterThan(1.8);
    await page.screenshot({ path: testInfo.outputPath(`${profile.name}-face-dark.png`) });

    await dialog.getByRole("radio", { name: "Vertaling" }).click();
    await dialog.locator("textarea").fill("wordt niet bewaard");
    await back.click();
    await expect(dialog).toBeHidden();
    await expect(report).toBeFocused();
    await report.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("radio", { name: "Vertaling" })).not.toBeChecked();
    await expect(dialog.locator("textarea")).toHaveValue("");
    const keyboardBack = dialog.getByRole("button", { name: "Terug" });
    await keyboardBack.focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(report).toBeFocused();
    await report.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(report).toBeFocused();
    await fixture.getByRole("button", { name: "Antwoord tonen" }).click();
    await expect(fixture.getByRole("button", { name: "Melden" })).toHaveCount(1);
    await fixture.getByRole("button", { name: "Melden" }).click();
    await expect(dialog).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${profile.name}-answer-dark.png`) });
    await page.locator('[data-training-hotkeys-suspended="true"]').click({
      position: { x: 8, y: 8 },
    });
    await expect(dialog).toBeHidden();
    await expect(fixture.getByRole("button", { name: "Melden" })).toBeFocused();
  });
}

test("desktop light mode preserves the compact surface", async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/dev/sense-card-gate");
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  const fixture = page.locator('[data-gate-fixture="SC-01/02"]').first();
  await fixture.getByRole("button", { name: "Melden" }).click();
  await expect(page.getByRole("dialog", { name: "Wat klopt er niet?" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("desktop-face-light-reduced-motion.png") });
});

test("mobile keeps an offline report durably queued without blocking the card", async ({ page }, testInfo) => {
  await installReportTestSession(page);
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto("/dev/sense-card-gate");
  const fixture = page.locator('[data-gate-fixture="SC-01/02"]').first();
  await expect(fixture.getByRole("button", { name: "Melden" })).toBeVisible();
  await page.context().setOffline(true);
  await fixture.getByRole("button", { name: "Melden" }).click();
  const dialog = page.getByRole("dialog", { name: "Wat klopt er niet?" });
  await dialog.getByRole("radio", { name: "Laden of wachten" }).click();
  await dialog.getByRole("button", { name: "Versturen" }).click();
  await expect(dialog.getByRole("status")).toContainText("Bewaard voor later");
  await page.screenshot({ path: testInfo.outputPath("mobile-402x874-queued-dark.png") });
  await expect(fixture.getByRole("button", { name: "Antwoord tonen" })).toBeVisible();
  await expect.poll(() => outboxCount(page)).toBe(1);
});

test("an unauthenticated dev report is rejected instead of falsely queued", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto("/dev/sense-card-gate");
  const fixture = page.locator('[data-gate-fixture="SC-01/02"]').first();
  await fixture.getByRole("button", { name: "Melden" }).click();
  const dialog = page.getByRole("dialog", { name: "Wat klopt er niet?" });
  await dialog.getByRole("radio", { name: "Iets anders" }).click();
  await dialog.getByRole("button", { name: "Versturen" }).click();
  await expect(dialog.getByRole("status")).toContainText("niet aangemeld");
  await page.screenshot({ path: testInfo.outputPath("mobile-402x874-rejected-dark.png") });
  await expect.poll(() => outboxCount(page)).toBe(0);
});

test("accepted delivery stays on the same compact sheet", async ({ page }, testInfo) => {
  await installReportTestSession(page);
  await page.route("**/api/feedback/reports", async (route) => {
    const report = route.request().postDataJSON() as { reportId: string };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "accepted", reportId: report.reportId }),
    });
  });
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto("/dev/sense-card-gate");
  const fixture = page.locator('[data-gate-fixture="SC-01/02"]').first();
  await fixture.getByRole("button", { name: "Melden" }).click();
  const dialog = page.getByRole("dialog", { name: "Wat klopt er niet?" });
  await dialog.getByRole("radio", { name: "Iets anders" }).click();
  await dialog.getByRole("button", { name: "Versturen" }).click();
  await expect(dialog.getByRole("status")).toContainText("Verzonden");
  const close = dialog.getByRole("button", { name: "Sluiten" });
  await expect(close).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(close).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("mobile-402x874-sent-dark.png") });
});

test("online transient failure truthfully shows a scheduled retry", async ({ page }, testInfo) => {
  await installReportTestSession(page);
  await page.route("**/api/feedback/reports", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto("/dev/sense-card-gate");
  const fixture = page.locator('[data-gate-fixture="SC-01/02"]').first();
  await fixture.getByRole("button", { name: "Melden" }).click();
  const dialog = page.getByRole("dialog", { name: "Wat klopt er niet?" });
  await dialog.getByRole("radio", { name: "Iets anders" }).click();
  await dialog.getByRole("button", { name: "Versturen" }).click();
  await expect(dialog.getByRole("status")).toContainText("automatisch opnieuw");
  await expect.poll(() => outboxCount(page)).toBe(1);
  await page.screenshot({ path: testInfo.outputPath("mobile-402x874-scheduled-dark.png") });
});

test("storage failure keeps the immutable report available for explicit retry", async ({ page }, testInfo) => {
  await installReportTestSession(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { configurable: true, value: undefined });
  });
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto("/dev/sense-card-gate");
  const fixture = page.locator('[data-gate-fixture="SC-01/02"]').first();
  await fixture.getByRole("button", { name: "Melden" }).click();
  const dialog = page.getByRole("dialog", { name: "Wat klopt er niet?" });
  await dialog.getByRole("radio", { name: "Iets anders" }).click();
  await dialog.getByRole("button", { name: "Versturen" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Probeer opnieuw");
  await expect(dialog.getByRole("button", { name: "Opnieuw proberen" })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("mobile-402x874-retry-dark.png") });
});

test("IndexedDB lease admits one sender across two tabs and finalizes once", async ({ browser }) => {
  const context = await browser.newContext();
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  await Promise.all([installReportTestSession(pageA), installReportTestSession(pageB)]);
  let requests = 0;
  await context.route("**/api/feedback/reports", async (route) => {
    requests += 1;
    const report = route.request().postDataJSON() as { reportId: string };
    await new Promise((resolve) => setTimeout(resolve, 100));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "accepted", reportId: report.reportId }),
    });
  });
  await Promise.all([
    pageA.goto("/dev/sense-card-gate"),
    pageB.goto("/dev/sense-card-gate"),
  ]);
  await context.setOffline(true);
  const fixture = pageA.locator('[data-gate-fixture="SC-01/02"]').first();
  await fixture.getByRole("button", { name: "Melden" }).click();
  const dialog = pageA.getByRole("dialog", { name: "Wat klopt er niet?" });
  await dialog.getByRole("radio", { name: "Iets anders" }).click();
  await dialog.getByRole("button", { name: "Versturen" }).click();
  await expect.poll(() => outboxCount(pageA)).toBe(1);
  await context.setOffline(false);
  await expect.poll(() => outboxCount(pageA)).toBe(0);
  expect(requests).toBe(1);
  await context.close();
});

test("exact retry cannot overwrite a real IndexedDB active lease", async ({ page }) => {
  await installReportTestSession(page);
  await page.goto("/dev/sense-card-gate");
  await page.context().setOffline(true);
  const queue = page.getByTestId("queue-exact-report-fixture");
  await queue.evaluate((element) => (element as HTMLButtonElement).click());
  await expect(queue).toHaveAttribute("data-result", "queued");
  await expect.poll(() => outboxCount(page)).toBe(1);
  const active = await page.evaluate(() => new Promise<Record<string, unknown>>((resolve, reject) => {
    const open = indexedDB.open("2000nl-diagnostic-report-outbox", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const transaction = open.result.transaction("reports", "readwrite");
      const store = transaction.objectStore("reports");
      const read = store.get("77777777-7777-4777-8777-777777777777");
      let next: Record<string, unknown>;
      read.onsuccess = () => {
        next = {
          ...read.result,
          status: "sending",
          attemptCount: 7,
          retryAt: 123456,
          expiresAt: 9876543210000,
          leaseToken: "real-active-lease",
          leaseUntil: Date.now() + 60_000,
        };
        store.put(next);
      };
      transaction.oncomplete = () => resolve(next!);
      transaction.onerror = () => reject(transaction.error);
    };
  }));
  await queue.evaluate((element) => (element as HTMLButtonElement).click());
  const after = await page.evaluate(() => new Promise<Record<string, unknown>>((resolve, reject) => {
    const open = indexedDB.open("2000nl-diagnostic-report-outbox", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const read = open.result.transaction("reports", "readonly").objectStore("reports")
        .get("77777777-7777-4777-8777-777777777777");
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(read.error);
    };
  }));
  expect(after).toEqual(active);
});

test("startup purges an expired real IndexedDB record without sending", async ({ page }) => {
  await installReportTestSession(page);
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto("/dev/sense-card-gate");
  await page.context().setOffline(true);
  const fixture = page.locator('[data-gate-fixture="SC-01/02"]').first();
  await fixture.getByRole("button", { name: "Melden" }).click();
  const dialog = page.getByRole("dialog", { name: "Wat klopt er niet?" });
  await dialog.getByRole("radio", { name: "Iets anders" }).click();
  await dialog.getByRole("button", { name: "Versturen" }).click();
  await expect.poll(() => outboxCount(page)).toBe(1);
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open("2000nl-diagnostic-report-outbox", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const transaction = open.result.transaction("reports", "readwrite");
      const store = transaction.objectStore("reports");
      const all = store.getAll();
      all.onsuccess = () => {
        for (const record of all.result) store.put({ ...record, expiresAt: Date.now() - 1 });
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    };
  }));
  let requests = 0;
  await page.route("**/api/feedback/reports", (route) => {
    requests += 1;
    return route.abort();
  });
  await page.context().setOffline(false);
  await expect.poll(() => outboxCount(page)).toBe(0);
  expect(requests).toBe(0);
});

for (const profile of [profiles[0], profiles[2]]) {
  test(`${profile.name} Library keeps one global action without inline flags or overlap`, async ({ page }, testInfo) => {
    await page.setViewportSize(profile.viewport);
    await page.goto("/dev/sense-card-gate");
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    const fixture = page.locator('[data-gate-title="SC-01/02 · Library · single sense · full"]');
    await expect(fixture.getByRole("button", { name: "Melden" })).toHaveCount(1);
    await expect(fixture.getByRole("button", { name: /Melden:/ })).toHaveCount(0);
    const action = fixture.getByRole("button", { name: "Melden" });
    const card = fixture.getByTestId("library-sense-card-group");
    const [actionBox, cardBox] = await Promise.all([action.boundingBox(), card.boundingBox()]);
    expect(actionBox).not.toBeNull();
    expect(cardBox).not.toBeNull();
    expect((actionBox?.y ?? 0) + (actionBox?.height ?? 0)).toBeLessThanOrEqual(
      (cardBox?.y ?? 0) + (cardBox?.height ?? 0),
    );
    await action.click();
    await expect(page.getByRole("dialog", { name: "Wat klopt er niet?" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${profile.name}-library-dark.png`) });
  });
}

for (const profile of [profiles[0], profiles[2]]) {
  test(`${profile.name} dense Library keeps final content above the global report action`, async ({ page }) => {
    await page.setViewportSize(profile.viewport);
    await page.goto("/dev/sense-card-gate");
    const fixture = page.locator('[data-gate-title="SC-03 · Library · dense report reserve"]');
    const scroll = fixture.getByTestId("library-sense-card-scroll-region");
    await scroll.evaluate((node) => { node.scrollTop = node.scrollHeight; });
    const lastContent = fixture.locator("article").last();
    const action = fixture.getByRole("button", { name: "Melden" });
    await expect(lastContent).toBeVisible();
    const [lastBox, actionBox, scrollBox] = await Promise.all([
      lastContent.boundingBox(), action.boundingBox(), scroll.boundingBox(),
    ]);
    expect(lastBox).not.toBeNull();
    expect(actionBox).not.toBeNull();
    expect(scrollBox).not.toBeNull();
    expect(
      (actionBox?.y ?? 0) - ((lastBox?.y ?? 0) + (lastBox?.height ?? 0)),
    ).toBeGreaterThanOrEqual(12);
    expect((lastBox?.y ?? 0) + (lastBox?.height ?? 0)).toBeLessThanOrEqual(
      (scrollBox?.y ?? 0) + (scrollBox?.height ?? 0),
    );
  });
}
