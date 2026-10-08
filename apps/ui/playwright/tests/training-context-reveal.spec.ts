import { expect, test } from "@playwright/test";
test("context question stays in the outgoing card until the answer is ready", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/dev/sense-card-gate?prototype=reading&fixture=long&context=1&clean=1");
  const stage = page.getByTestId("training-sense-card-stage");
  const question = await page.getByTestId("reverse-prompt").textContent();
  const shell = stage.getByTestId("training-sense-card-shell");
  const outgoingText = await shell.textContent();
  const origin = await shell.boundingBox();
  await page.getByRole("button", { name: "Antwoord tonen", exact: true }).click();
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
  const again = stage.getByRole("button", { name: "Opnieuw", exact: true });
  await expect(again).toBeDisabled();
  await expect(overlay).toHaveCount(0);
  await expect(again).toBeEnabled();
  const matchingTranslation = stage.locator('[data-content-translation="true"]').filter({ hasText: question! });
  await expect(matchingTranslation).toHaveCount(1);
  await expect(matchingTranslation).toBeVisible();
  await expect(again).toBeFocused();
});
