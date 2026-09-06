import { expect, test } from "@playwright/test";

// #251: one visual line, shared type and quiet hover treatment on Face/Answer.
// Exercise the real Report trigger, not a substitute button in the gallery.
for (const width of [390, 834, 1440]) {
  for (const theme of ["light", "dark"]) {
    test(`secondary actions align at ${width}px in ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 960 });
      await page.emulateMedia({ colorScheme: theme as "light" | "dark", reducedMotion: "reduce" });
      await page.route("**/*", (route) => {
        const url = new URL(route.request().url());
        return url.origin === "http://127.0.0.1:3100" && !url.pathname.startsWith("/api/")
          ? route.continue() : route.abort();
      });
      await page.goto("/dev/sense-card-gate");
      await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), theme === "dark");
      await page.evaluate(() => document.fonts.ready);
      const stage = page.locator('[data-gate-fixture="SC-01/02"]').getByTestId("training-sense-card-stage");
      for (const side of ["face", "answer"]) {
        if (side === "answer") await stage.getByRole("button", { name: "Antwoord tonen" }).click();
        const report = stage.getByRole("button", { name: "Melden", exact: true });
        const known = stage.getByRole("button", { name: "Markeer als bekend", exact: true });
        const boxes = await Promise.all([report.boundingBox(), known.boundingBox()]);
        expect(boxes.every(Boolean)).toBe(true);
        expect(Math.abs(boxes[0]!.y + boxes[0]!.height / 2 - boxes[1]!.y - boxes[1]!.height / 2)).toBeLessThan(1);
        const textTops = await Promise.all([report, known].map((button) => button.evaluate((el) => {
          const text = Array.from(el.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
          if (!text) throw new Error("Action label not found");
          const range = document.createRange();
          range.selectNode(text);
          return range.getBoundingClientRect().top;
        })));
        expect(Math.abs(textTops[0] - textTops[1])).toBeLessThan(1);
        expect(boxes[0]!.x + boxes[0]!.width).toBeLessThan(boxes[1]!.x);
        for (const property of ["font-size", "line-height", "font-weight", "color"]) {
          const values = await Promise.all([report, known].map((button) => button.evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), property)));
          expect(values[0]).toBe(values[1]);
        }
        for (const button of [report, known]) {
          await expect(button).toHaveCSS("height", "24px");
          await button.hover();
          await expect(button).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
          await expect(button).toHaveCSS("border-top-width", "0px");
          await button.focus();
          await page.keyboard.press("Tab");
          await page.keyboard.press("Shift+Tab");
          await expect(button).toBeFocused();
          expect(await button.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");
        }
        await report.click();
        const dialog = page.getByRole("dialog", { name: "Wat klopt er niet?" });
        await expect(dialog).toBeVisible();
        await dialog.getByRole("button", { name: "Terug", exact: true }).click();
        await expect(report).toBeFocused();
        await expect(stage).toHaveAttribute("data-side", side);
        await report.evaluate((el) => el.blur());
        await page.mouse.move(0, 0);
        expect(await page.locator("html").evaluate((el) => el.classList.contains("dark"))).toBe(theme === "dark");
        await stage.getByTestId("training-sense-card-dock").screenshot({
          path: testInfo.outputPath(`actions-${width}-${theme}-${side}.png`),
        });
      }
    });
  }
}
