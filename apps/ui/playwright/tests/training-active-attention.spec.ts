import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";
import { platformV2Message } from "../../lib/platform/platformV2ClientI18n";
import { parseStudyTimeMeasurement, type StudyTimeMeasurement } from "../../lib/training/studyTime/model";

test.skip(process.env.NEXT_PUBLIC_TRAINING_PRESENTATION_V1 !== "true", "Approved presentation is opt-in.");

test("native Report modal pauses card attention delivery and preserves resume identity", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setupAuthenticatedTrainingAttributionPage(page, 0, { visualProfile: "answer", useUuidEntryIds: true, useUuidSessionId: true,
    settingsOverrides: { preferences: { onboardingCompleted: true, onboardingLanguage: "en" } } });
  const receipts: StudyTimeMeasurement[] = [];
  await page.route("**/api/training/study-time", async route => {
    const value = parseStudyTimeMeasurement(route.request().postDataJSON());
    expect(value).not.toBeNull(); receipts.push(value!);
    await route.fulfill({ json: { accepted: true, duplicate: false } });
  });
  await page.getByRole("button", { name: "Start training", exact: true }).click();
  const card = page.getByTestId("training-sense-card-stage");
  await expect(card).toBeVisible();
  await page.bringToFront();
  await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(true);
  const report = page.getByRole("button", { name: "Report", exact: true });
  await expect(report).toBeEnabled();
  await page.waitForTimeout(1200);
  await report.focus(); await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: platformV2Message("en", "senseCard.reportSheet.title"), exact: true });
  await expect(dialog).toBeVisible();
  await expect.poll(() => receipts.length).toBeGreaterThan(0);
  const modalCount = receipts.length;
  const resumed = receipts.reduce((sum,item)=>sum+item.activeMilliseconds,0);
  expect(resumed).toBeGreaterThanOrEqual(1000);
  expect(resumed).toBeLessThan(5000);
  // Exceed the real 15-second checkpoint while the native modal is open.
  await page.waitForTimeout(17000);
  expect(receipts).toHaveLength(modalCount);
  expect(receipts.every(item=>item.sessionId === "40710000-0000-4000-8000-000000000001" && item.family === "meaning")).toBe(true);
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
  await expect(report).toBeFocused();
  await expect(card).toHaveAttribute("data-side","face");
  await page.waitForTimeout(1200);
  await report.focus(); await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await expect.poll(() => receipts.length).toBeGreaterThan(modalCount);
  const afterResume = receipts.slice(modalCount).reduce((sum,item)=>sum+item.activeMilliseconds,0);
  expect(afterResume).toBeGreaterThanOrEqual(1200);
  expect(afterResume).toBeLessThan(5000);
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
});
