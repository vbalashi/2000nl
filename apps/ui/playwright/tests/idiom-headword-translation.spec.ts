import { expect, test } from "@playwright/test";

for (const width of [320, 390]) {
  for (const direction of ["Direct", "Reverse"]) {
    test(`idiom ${direction} at ${width}px: main headword translation is answer-only and shares visibility`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
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
      await expect(card.getByText("говорить о пустяках", { exact: false })).toBeVisible();
      const natural = card.getByText("говорить о пустяках", { exact: false });
      const literal = natural.locator("[data-literal-translation]");
      await expect(literal).toHaveCSS("display", "inline");
      await expect(literal).toHaveCSS("font-style", "italic");
      expect(await literal.evaluate(element => parseFloat(getComputedStyle(element).fontSize) < parseFloat(getComputedStyle(element.parentElement!).fontSize))).toBe(true);
      expect(await natural.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await expect(card.getByText("(буквально: говорить о коровках и телятах)", { exact: true })).toBeVisible();
      await expect(card.getByText("een dier dat melk geeft", { exact: true })).toHaveCount(0);
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-pressed", "false");
      await expect(card.getByText("(буквально: говорить о коровках и телятах)", { exact: true }).locator("xpath=ancestor::*[@aria-hidden][1]")).toHaveAttribute("aria-hidden", "true");
      // Translation slots keep layout space and hide through aria-hidden/opacity.
      await expect(card.getByTestId("entry-translation").locator("xpath=ancestor::*[@aria-hidden][1]")).toHaveAttribute("aria-hidden", "true");
      await expect(card.getByText("говорить о пустяках", { exact: false }).locator("xpath=ancestor::*[@aria-hidden][1]")).toHaveAttribute("aria-hidden", "true");
    });
  }
}

test("direct word front places the answer POS at upper left beside audio", async ({page}) => {
  await page.setViewportSize({width: 320, height: 844});
  await page.goto("/dev/sense-card-gate");
  const card = page.getByTestId("training-sense-card-stage");
  const pos = card.getByTestId("training-face-part-of-speech");
  await expect(pos).toBeVisible();
  const label = await pos.innerText();
  const shell = (await card.getByTestId("training-sense-card-shell").boundingBox())!;
  const position = (await pos.boundingBox())!;
  const audio = (await card.getByTestId("training-card-audio-corner").boundingBox())!;
  expect(position.x - shell.x).toBeLessThan(40);
  expect(position.y - shell.y).toBeLessThan(40);
  expect(position.x + position.width).toBeLessThan(audio.x);
  await card.getByRole("button", {name: "Antwoord tonen", exact: true}).click();
  await expect(card.getByText(label, {exact: true})).toBeVisible();
});
