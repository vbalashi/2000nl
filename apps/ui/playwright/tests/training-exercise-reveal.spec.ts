import { expect, test } from "@playwright/test";
for (const family of ["Direct", "Reverse", "Sentence"]) {
  test(`${family}: whole-card reveal keeps grading locked until motion ends`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/dev/sense-card-gate?prototype=exercise");
    await page.getByRole("button", { name: family, exact: true }).click();
    const card = page.getByTestId("training-exercise-card");
    const prompt = family === "Direct" ? card.getByRole("heading", { level: 2 }) : card.getByTestId("reverse-prompt");
    const question = await prompt.textContent();
    const shell = card.getByTestId("training-sense-card-shell");
    const outgoingText = await shell.textContent();
    const origin = await shell.boundingBox();
    await card.getByRole("button", { name: "Show answer", exact: true }).click();
    const overlay = page.locator("[data-training-reveal-overlay]");
    const firstFrame = await overlay.evaluate(node => {
      const style = (node as HTMLElement).style;
      return {
        text: node.textContent,
        ariaHidden: node.getAttribute("aria-hidden"),
        inert: (node as HTMLElement).inert,
        position: style.position,
        left: parseFloat(style.left), top: parseFloat(style.top),
        width: parseFloat(style.width), height: parseFloat(style.height),
      };
    });
    expect(firstFrame.text).toBe(outgoingText);
    expect(firstFrame.text).toContain(question!);
    expect(firstFrame.ariaHidden).toBe("true");
    expect(firstFrame.inert).toBe(true);
    expect(firstFrame.position).toBe("fixed");
    expect(firstFrame.left).toBeCloseTo(origin!.x, 1);
    expect(firstFrame.top).toBeCloseTo(origin!.y, 1);
    expect(firstFrame.width).toBeCloseTo(origin!.width, 1);
    expect(firstFrame.height).toBeCloseTo(origin!.height, 1);
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
