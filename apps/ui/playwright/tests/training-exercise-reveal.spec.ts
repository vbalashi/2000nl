import { expect, test } from "@playwright/test";

test.skip(process.env.NEXT_PUBLIC_TRAINING_PRESENTATION_V1 !== "true", "Approved presentation is opt-in.");
for (const family of ["Direct", "Reverse", "Sentence"]) {
  test(`${family}: selected question moves into the owned answer and grading waits`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/dev/sense-card-gate?prototype=exercise");
    await page.getByRole("button", { name: family, exact: true }).click();
    const card = page.getByTestId("training-exercise-card");
    const prompt = family === "Direct" ? card.getByRole("heading", { level: 2 }) : card.getByTestId("reverse-prompt");
    const question = await prompt.textContent();
    await card.getByRole("button", { name: "Show answer", exact: true }).click();
    const overlay = page.locator("[data-training-reveal-overlay]");
    await expect(overlay).toHaveText(question!);
    await expect(card.getByRole("button", { name: "Again", exact: true })).toBeDisabled();
    await expect(overlay).toHaveCount(0);
    await expect(card.getByRole("button", { name: "Again", exact: true })).toBeEnabled();
    await expect(card.getByRole("button", { name: "Again", exact: true })).toBeFocused();
    const text = await card.locator("[data-content-node-id]").evaluateAll(nodes => nodes.map(node => node.textContent));
    expect(text.some(value => value?.includes(question!))).toBe(true);
    await card.getByRole("button", { name: "Again", exact: true }).click();
    await expect(card).toHaveAttribute("data-side", "face");
    await expect(overlay).toHaveCount(0);
  });
}
