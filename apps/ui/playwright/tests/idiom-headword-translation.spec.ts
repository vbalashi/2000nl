import { expect, test } from "@playwright/test";

for (const direction of ["Direct", "Reverse"]) {
  test(`idiom ${direction}: main headword translation is answer-only and shares visibility`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dev/sense-card-gate?prototype=exercise&fixture=koe");
    await page.getByRole("button", { name: direction, exact: true }).click();
    const card = page.getByTestId("training-exercise-card");
    await expect(card.getByTestId("entry-translation")).toHaveCount(0);
    await card.getByRole("button", { name: "Show answer", exact: true }).click();
    const toggle = card.getByRole("button", { name: "Translate", exact: true });
    await expect(toggle).toBeEnabled();
    await toggle.click();
    await expect(card.getByTestId("entry-translation")).toBeVisible();
    await expect(card.getByTestId("entry-translation")).toHaveText("корова");
    await expect(card.getByText("говорить о пустяках", { exact: true })).toBeVisible();
    await expect(card.getByText("(literally: говорить о коровках и телятах)", { exact: true })).toBeVisible();
    await expect(card.getByText("een dier dat melk geeft", { exact: true })).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(card.getByText("(literally: говорить о коровках и телятах)", { exact: true }).locator("xpath=ancestor::*[@aria-hidden][1]")).toHaveAttribute("aria-hidden", "true");
    // Translation slots keep layout space and hide through aria-hidden/opacity.
    await expect(card.getByTestId("entry-translation").locator("xpath=ancestor::*[@aria-hidden][1]")).toHaveAttribute("aria-hidden", "true");
    await expect(card.getByText("говорить о пустяках", { exact: true }).locator("xpath=ancestor::*[@aria-hidden][1]")).toHaveAttribute("aria-hidden", "true");
  });
}
