import { expect, test } from "@playwright/test";
import { assertTestFontsReady } from "../utils/assertTestFontsReady";

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }, { width: 320, height: 568 }]) {
  for (const mode of ["direct", "reverse", "sentence"]) {
    test(`${mode} prompt anchor and hint at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.goto("/dev/sense-card-gate?prototype=exercise");
      // The dev-only Next indicator overlaps the hint at mobile sizes.
      await page.addStyleTag({content: "nextjs-portal { display: none; }"});
      await assertTestFontsReady(page);
      if (mode !== "direct") await page.getByRole("button", {name: mode === "reverse" ? "Reverse" : "Sentence", exact:true}).click();
      const region = page.getByTestId("training-face-scroll");
      const prompt = region.getByTestId("training-main-prompt");
      const before = await prompt.boundingBox();
      const area = await region.boundingBox();
      const overflow = await region.evaluate(node => node.scrollHeight > node.clientHeight + 1);
      if (!overflow) expect(Math.abs(before!.y + before!.height/2 - area!.y - area!.height/2)).toBeLessThan(2);
      expect(Math.abs(before!.x + before!.width/2 - area!.x - area!.width/2)).toBeLessThan(2);
      const heading = prompt.locator("h2");
      if (await heading.count()) {
        const text = await heading.boundingBox();
        expect(Math.abs(text!.x + text!.width/2 - area!.x - area!.width/2)).toBeLessThan(2);
      }
      const hintButton = page.getByRole("button", { name: "Show hint", exact: true });
      if (await hintButton.count()) {
        await hintButton.click();
        const hint = region.locator("aside");
        await expect(hint).toBeVisible();
        await expect.poll(() => hint.evaluate(node => getComputedStyle(node).opacity)).toBe("1");
        const after = await prompt.boundingBox();
        expect(Math.abs(after!.y - before!.y)).toBeLessThan(1);
        const hintBox = await hint.boundingBox();
        expect(hintBox!.y).toBeGreaterThanOrEqual(after!.y + after!.height);
      }
      expect(await page.locator("html").evaluate(node => node.scrollWidth)).toBe(viewport.width);
      await page.screenshot({path:testInfo.outputPath("prompt-anchor.png")});
      const hide = page.getByRole("button", {name:"Hide hint", exact:true});
      if (await hide.count()) {
        await hide.click();
        await expect(region.locator("aside")).toBeHidden();
        const hidden = await prompt.boundingBox();
        expect(Math.abs(hidden!.y - before!.y)).toBeLessThan(1);
      }
    });
  }
}

for (const fixture of ["short", "long-word", "long"]) {
  test(`word front and long prompt remain readable: ${fixture}`, async ({page}) => {
    await page.setViewportSize({width:320,height:568});
    await page.goto(`/dev/sense-card-gate?prototype=reading&mode=${fixture === "long" ? "reverse" : "direct"}&fixture=${fixture}&clean=1`);
    await assertTestFontsReady(page);
    const region = page.getByTestId("training-face-scroll");
    const prompt = region.getByTestId("training-main-prompt");
    const before = await prompt.boundingBox();
    const area = await region.boundingBox();
    if (await region.evaluate(node => node.scrollHeight <= node.clientHeight + 1)) {
      expect(Math.abs(before!.y + before!.height/2 - area!.y - area!.height/2)).toBeLessThan(2);
    }
    await page.getByRole("button", {name:"Hint tonen",exact:true}).click();
    const hint = region.locator("aside");
    await expect(hint).toBeVisible();
    // Opening a hint must not resize or scroll the prompt, even when text overflows.
    const after = await prompt.boundingBox();
    expect(Math.abs(after!.y - before!.y)).toBeLessThan(1);
    const hintBox = await hint.boundingBox();
    expect(hintBox!.y).toBeGreaterThanOrEqual(after!.y + after!.height);
    await region.press("End");
    await expect.poll(() => region.evaluate(node => node.scrollHeight-node.clientHeight-node.scrollTop)).toBeLessThanOrEqual(1);
    expect(await page.locator("html").evaluate(node => node.scrollWidth)).toBe(320);
  });
}

test("Indigo buttons have quiet boundaries and a distinct keyboard focus", async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto("/dev/sense-card-gate?prototype=exercise");
  await page.addStyleTag({content:"nextjs-portal { display: none; }"});
  await page.getByRole("button", {name:"Light / dark"}).click();
  // Cosmetic fixture state only: no account preferences are written.
  await page.locator("main").evaluate(node => node.setAttribute("data-practice-palette", "indigo"));
  for (const name of ["Show hint", "Show answer"]) {
    const button = page.getByRole("button", {name,exact:true});
    const colours = await button.evaluate(node => {
      const style = getComputedStyle(node);
      return {border:style.borderColor,quiet:style.getPropertyValue("--practice-border").trim()};
    });
    expect(colours.border).toBe("rgb(65, 65, 110)");
    expect(colours.quiet).toBe("#41416e");
  }
  const focused = page.getByRole("button", {name:"Show hint",exact:true});
  // WebKit follows the host keyboard-access setting and can skip buttons on Tab.
  await focused.focus();
  await focused.press("ArrowLeft");
  await expect(focused).toBeFocused();
  expect(await focused.evaluate(node => getComputedStyle(node).outlineWidth)).toBe("2px");
});

test("hint fade respects existing animation preferences and reduced motion", async ({page}) => {
  await page.goto("/dev/sense-card-gate?prototype=exercise");
  const hint = page.getByTestId("training-face-scroll").locator("aside");
  await expect(hint).toHaveCSS("transition-duration", "0.18s");
  await page.getByRole("checkbox", {name:"animation",exact:true}).uncheck();
  await expect(hint).toHaveCSS("transition-duration", "0s");
  await page.getByRole("checkbox", {name:"animation",exact:true}).check();
  await page.emulateMedia({reducedMotion:"reduce"});
  // The shared reduced-motion reset keeps a tiny duration for event delivery.
  await expect(hint).toHaveCSS("transition-property", "none");
});
