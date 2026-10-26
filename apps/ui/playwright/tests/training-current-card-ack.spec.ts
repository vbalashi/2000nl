import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";

test("@pilot display acknowledgement excludes prefetched cards and hidden Training", async ({ page }) => {
  const fixture = await setupAuthenticatedTrainingAttributionPage(page, 0, {
    visualProfile: "answer", useUuidEntryIds: true, useUuidSessionId: true,
  });
  expect(fixture.requests.currentCards.acknowledgements).toEqual([]);
  await page.getByRole("button", { name: /^(Start training|Начать тренировку|Training starten)$/i }).click();
  await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
  await expect.poll(() => fixture.requests.currentCards.acknowledgements.length).toBe(1);
  const acknowledged = fixture.requests.currentCards.acknowledgements[0]!;
  await expect.poll(() => fixture.requests.projectionLookups.some(lookup => lookup.entryId && lookup.entryId !== acknowledged.entryId)).toBe(true);
  // The next target is prepared, but only the displayed target is acknowledged.
  expect(fixture.requests.currentCards.acknowledgements.map(ack => ack.entryId)).toEqual([acknowledged.entryId]);
  await page.getByRole("button", { name: /^Library$|^Библиотека$|^Bibliotheek$/ }).first().click();
  await expect(page.getByTestId("training-sense-card-v2")).not.toBeVisible();
  const countWhileHidden = fixture.requests.currentCards.acknowledgements.length;
  await page.waitForTimeout(500);
  expect(fixture.requests.currentCards.acknowledgements).toHaveLength(countWhileHidden);
  await page.getByRole("button", { name: /^Training$|^Тренировка$/ }).first().click();
  await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
  expect(fixture.requests.currentCards.acknowledgements).toHaveLength(countWhileHidden);
});
