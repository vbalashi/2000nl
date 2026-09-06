import { expect, test, type Page } from "@playwright/test";

const variants = [
  { name: "normal", body: 16, headword: 44, translation: 13 },
  { name: "large", body: 18, headword: 46, translation: 14 },
  { name: "largest", body: 20, headword: 48, translation: 15 },
];
const viewports = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 960 },
];

test("narrow reverse prompt remains readable to the last line without shrinking text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openStudy(page, "variant=largest&mode=reverse&fixture=long&clean=1");
  const prompt = page.getByTestId("reverse-prompt");
  const dock = page.getByTestId("training-sense-card-dock");
  const before = await dock.boundingBox();
  const shell = await page.getByTestId("training-sense-card-shell").boundingBox();
  await prompt.hover();
  await page.mouse.wheel(0, 1000);
  await expect.poll(async () => {
    const box = await prompt.boundingBox();
    return box!.y + box!.height;
  }).toBeLessThanOrEqual(shell!.y + shell!.height);
  expect(await fontSize(page, '[data-testid="reverse-prompt"]')).toBeCloseTo(29.6, 1);
  expect(await dock.boundingBox()).toEqual(before);
  await expect(page.getByRole("button", { name: "Antwoord tonen", exact: true })).toBeInViewport();
});

test("usage, example and idiom use one literary typography role", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStudy(page, "variant=largest&clean=1");
  await page.getByRole("button", { name: "Antwoord tonen", exact: true }).click();
  const styles = await page.locator('[data-section] [data-content-kind] > div > p').evaluateAll((elements) =>
    elements.map((el) => {
      const style = getComputedStyle(el);
      return { size: style.fontSize, leading: style.lineHeight, family: style.fontFamily, style: style.fontStyle };
    }),
  );
  expect(styles).toHaveLength(3);
  expect(styles[0].size).toBe("20px");
  expect(styles[1]).toEqual(styles[0]);
  expect(styles[2]).toEqual(styles[0]);
});

for (const variant of variants) {
  test(`article keeps half the headword size on both sides: ${variant.name}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openStudy(page, `variant=${variant.name}&clean=1`);
    const lockup = page.getByTestId("sense-card-headword-lockup");
    const ratio = () => lockup.evaluate((el) => {
      const word = el.querySelector("h2")!;
      const article = Array.from(el.querySelectorAll("span")).find((node) => node.textContent === "de")!;
      return parseFloat(getComputedStyle(article).fontSize) / parseFloat(getComputedStyle(word).fontSize);
    });
    expect(await ratio()).toBeCloseTo(0.5, 2);
    await page.getByRole("button", { name: "Antwoord tonen", exact: true }).click();
    expect(await ratio()).toBeCloseTo(0.5, 2);
  });
}

test("phone footer spends spare width on readable one-line progress", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStudy(page, "variant=normal&clean=1");
  const progress = page.getByTestId("training-session-footer-progress");
  expect(await progress.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(10.5);
  const box = await progress.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(360);
  const rows = await progress.locator(':scope > div').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
  expect(new Set(rows).size).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

for (const width of [390, 768]) {
  for (const variant of variants) {
    test(`long headword keeps article proportion at ${width}: ${variant.name}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
      await openStudy(page, `variant=${variant.name}&fixture=long-word&clean=1`);
      const word = page.getByRole("heading", { name: "ar·beids·on·ge·schikt·heids·ver·ze·ke·ring", exact: true });
      await expect(word).toHaveAttribute("data-long-headword", "true");
      for (const side of ["face", "answer"]) {
        if (side === "answer") await page.getByRole("button", { name: "Antwoord tonen", exact: true }).click();
        const ratio = await word.evaluate((el) => {
          const article = el.previousElementSibling!;
          return parseFloat(getComputedStyle(article).fontSize) / parseFloat(getComputedStyle(el).fontSize);
        });
        expect(ratio).toBeCloseTo(0.5, 2);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        await page.screenshot({ animations: "disabled", path: testInfo.outputPath(`longword-${width}-${variant.name}-${side}.png`) });
      }
    });
  }
}

async function openStudy(page: Page, query: string) {
  const origin = new URL(test.info().project.use.baseURL as string).origin;
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.origin === origin && !url.pathname.startsWith("/api/")
      ? route.continue()
      : route.abort();
  });
  await page.goto(`/dev/sense-card-gate?prototype=reading&${query}`);
  await expect(page.locator("[data-reading-size-prototype]")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function fontSize(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
}

for (const viewport of viewports) {
  for (const theme of ["light", "dark"] as const) {
    for (const variant of variants) {
      test(`${viewport.name} ${theme} ${variant.name}: real card typography and pinned controls`, async ({ page }, testInfo) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
        await openStudy(page, `variant=${variant.name}&clean=1`);
        await expect.poll(() => page.locator("html").evaluate((el) => el.classList.contains("dark"))).toBe(theme === "dark");
        const stage = page.getByTestId("training-sense-card-stage");
        const dock = page.getByTestId("training-sense-card-dock");
        const faceDock = await dock.boundingBox();
        const stem = `${viewport.name}-${theme}-${variant.name}`;
        await page.screenshot({ animations: "disabled", path: testInfo.outputPath(`${stem}-face.png`) });
        await stage.getByRole("button", { name: "Antwoord tonen", exact: true }).click();
        await expect.poll(() => fontSize(page, '[data-testid="sense-card-headword-lockup"] h2')).toBe(variant.headword);
        await expect.poll(() => fontSize(page, '[data-testid="training-answer-scroll"] p')).toBe(variant.body);
        const example = stage.getByText("Margriet en Ellie zaten op de bank televisie te kijken.", { exact: true });
        expect(await example.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))).toBe(variant.body);
        expect(await example.evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Newsreader");
        const report = stage.getByRole("button", { name: "Melden", exact: true });
        const known = stage.getByRole("button", { name: "Markeer als bekend", exact: true });
        expect(await report.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))).toBe(11.5);
        const [a, b] = [await report.boundingBox(), await known.boundingBox()];
        expect(Math.abs(a!.y + a!.height / 2 - b!.y - b!.height / 2)).toBeLessThan(1);
        const answerDock = await dock.boundingBox();
        expect(answerDock!.y + answerDock!.height).toBeCloseTo(faceDock!.y + faceDock!.height, 0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
        expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(viewport.height);
        await page.screenshot({ animations: "disabled", path: testInfo.outputPath(`${stem}-answer.png`) });
        await stage.getByRole("button", { name: "Vertalen", exact: true }).click();
        await expect(stage.locator('[data-content-translation="true"]').first()).toBeVisible();
        expect(await fontSize(page, '[data-content-translation="true"]')).toBe(variant.translation);
        await page.screenshot({ animations: "disabled", path: testInfo.outputPath(`${stem}-translated.png`) });
      });
    }
  }
}

test("size controls preserve the revealed card and are recoverable after clean capture", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStudy(page, "variant=normal&clean=1");
  await page.getByRole("button", { name: "Antwoord tonen", exact: true }).click();
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/variant=large/);
  await expect(page.getByRole("button", { name: "Goed", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show reading size prototype controls" }).click();
  await page.getByRole("button", { name: "Reading · Large", exact: true }).click();
  await page.getByLabel("Reading size", { exact: true }).selectOption("largest");
  await expect(page.locator("[data-reading-size]")).toHaveAttribute("data-reading-size", "largest");
  await page.getByRole("button", { name: "Clean", exact: true }).click();
  await expect(page.getByRole("button", { name: "Show reading size prototype controls" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Goed", exact: true })).toBeVisible();
});

for (const variant of variants) {
  test(`narrow long translated Answer ${variant.name}: content scrolls without moving controls`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await openStudy(page, `variant=${variant.name}&fixture=long&clean=1`);
    await page.getByRole("button", { name: "Antwoord tonen", exact: true }).click();
    await page.getByRole("button", { name: "Vertalen", exact: true }).click();
    const scroll = page.getByTestId("training-answer-scroll");
    const word = page.getByTestId("sense-card-headword-lockup");
    const dock = page.getByTestId("training-sense-card-dock");
    const before = [await word.boundingBox(), await dock.boundingBox()];
    await expect.poll(() => scroll.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(50);
    await page.getByRole("button", { name: "Meer kaartinhoud tonen", exact: true }).click();
    await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(10);
    expect([await word.boundingBox(), await dock.boundingBox()]).toEqual(before);
    await page.screenshot({ animations: "disabled", path: testInfo.outputPath(`narrow-dark-${variant.name}-long-scrolled.png`) });
  });
}

// Overflow is allowed only inside a keyboard- and pointer-scrollable region.
// Capture the initial composition, then verify access to the last line.
for (const viewport of [
  { name: "phone", width: 390, height: 844 },
  { name: "narrow", width: 320, height: 568 },
]) {
  for (const variant of variants) {
    test(`${viewport.name} reverse long Face ${variant.name}: capture containment evidence`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
      await openStudy(page, `variant=${variant.name}&mode=reverse&fixture=long&clean=1`);
      const prompt = page.getByTestId("reverse-prompt");
      await expect(prompt).toContainText("meestal met een rugleuning en soms met armleuningen");
      const bounds = await prompt.evaluate((el) => {
        const text = el.getBoundingClientRect();
        const shell = el.closest("article")!.getBoundingClientRect();
        return {
          promptTop: text.top,
          promptBottom: text.bottom,
          shellTop: shell.top,
          shellBottom: shell.bottom,
          clipped: text.top < shell.top || text.bottom > shell.bottom,
          fontSize: getComputedStyle(el).fontSize,
        };
      });
      await testInfo.attach("reverse-containment", {
        body: JSON.stringify(bounds, null, 2),
        contentType: "application/json",
      });
      await page.screenshot({ animations: "disabled", path: testInfo.outputPath(`${viewport.name}-dark-${variant.name}-reverse-long.png`) });
      const region = page.getByRole("region", { name: "Kaartinhoud", exact: true });
      await region.press("End");
      await expect.poll(async () => {
        const text = await prompt.boundingBox();
        const frame = await region.boundingBox();
        return text!.y + text!.height <= frame!.y + frame!.height;
      }).toBe(true);
      await region.press(" ");
      await expect(page.getByTestId("training-sense-card-stage")).toHaveAttribute("data-side", "face");
      await page.screenshot({ animations: "disabled", path: testInfo.outputPath(`${viewport.name}-dark-${variant.name}-reverse-end.png`) });
      const showAnswer = page.getByRole("button", { name: "Antwoord tonen", exact: true });
      await expect(showAnswer).toBeInViewport();
      await showAnswer.click();
      await expect(page.getByTestId("training-answer-scroll")).toBeVisible();
      await expect(page.getByRole("button", { name: "Goed", exact: true })).toBeInViewport();
    });
  }
}

test("long reverse hint is reachable without covering the prompt or triggering an answer", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openStudy(page, "variant=largest&mode=reverse&fixture=long&clean=1");
  await page.getByRole("button", { name: "Hint tonen", exact: true }).click();
  const region = page.getByRole("region", { name: "Kaartinhoud", exact: true });
  const prompt = page.getByTestId("reverse-prompt");
  const hint = region.locator("aside");
  const [p, h] = [await prompt.boundingBox(), await hint.boundingBox()];
  expect(h!.y).toBeGreaterThanOrEqual(p!.y + p!.height);
  await region.press("End");
  await expect.poll(async () => {
    const box = await hint.boundingBox();
    const frame = await region.boundingBox();
    return box!.y + box!.height <= frame!.y + frame!.height;
  }).toBe(true);
  await region.press("Home");
  await expect.poll(async () => (await prompt.boundingBox())!.y).toBeGreaterThanOrEqual((await region.boundingBox())!.y);
  await expect(page.getByTestId("training-sense-card-stage")).toHaveAttribute("data-side", "face");
});
