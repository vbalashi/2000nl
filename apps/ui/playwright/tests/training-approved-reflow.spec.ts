import { expect, test, type Locator } from "@playwright/test";
import { assertTestFontsReady } from "../utils/assertTestFontsReady";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";

async function pressAndWaitForScrollEnd(scroll: Locator, key: string) {
  await scroll.evaluate(node => {
    node.setAttribute("data-qa-scroll-ended", "false");
    node.addEventListener("scrollend", () => node.setAttribute("data-qa-scroll-ended", "true"), { once: true });
  });
  await scroll.press(key);
  await expect(scroll).toHaveAttribute("data-qa-scroll-ended", "true");
}

for (const locale of ["en", "nl", "ru"]) {
  for (const viewport of [{ width: 844, height: 390 }, { width: 640, height: 400 }]) {
    test(`${locale} Extra retains a readable answer and ratings at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
      // 640×400 is CSS-space reflow equivalent to 1280×800 at 200%, not native zoom.
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await setupAuthenticatedTrainingAttributionPage(page, 0, {
        visualProfile: "long-idiom",
        settingsOverrides: {
          reading_size_phone: "extra", reading_size_desktop: "extra",
          preferences: { onboardingCompleted: true, onboardingLanguage: locale },
        },
      });
      await assertTestFontsReady(page);
      await page.getByRole("button", { name: /Training starten|Start training|Начать тренировку/i }).click();
      await page.getByRole("button", { name: /Show answer|Antwoord tonen|Показать ответ/i }).click();
      const ratings = page.getByTestId("training-review-grid");
      await expect(ratings).toBeInViewport({ ratio: 1 });
      const scroll = page.getByTestId("training-answer-scroll");
      const body = await scroll.boundingBox();
      expect(body!.height).toBeGreaterThan(80);
      await pressAndWaitForScrollEnd(scroll, "End");
      await expect.poll(() => scroll.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThanOrEqual(1);
      await pressAndWaitForScrollEnd(scroll, "Home");
      await expect.poll(() => scroll.evaluate(node => node.scrollTop)).toBe(0);
      await pressAndWaitForScrollEnd(scroll, "Space");
      await expect.poll(() => scroll.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
      await expect(page.getByTestId("training-sense-card-stage")).toHaveAttribute("data-side", "answer");
      await expect(ratings).toBeInViewport({ ratio: 1 });
      expect(await page.locator("html").evaluate(node => node.scrollWidth)).toBe(viewport.width);
      await page.addStyleTag({ content: `
        [data-testid="training-sense-card-stage"] :is(p, h2, span, button),
        [data-testid="training-session-chrome"] span {
          line-height: 1.5 !important;
          letter-spacing: .12em !important;
          word-spacing: .16em !important;
        }
        [data-testid="training-sense-card-stage"] p { margin-bottom: 2em !important; }
      ` });
      await expect(ratings).toBeInViewport({ ratio: 1 });
      if (locale === "nl" && viewport.width === 640) {
        await expect(ratings.locator("[data-columns]")).toHaveAttribute("data-columns", "2");
      }
      await expect.poll(() => page.getByTestId("training-card-frame").evaluate(node =>
        node.getAnimations().filter(animation => animation.playState === "running").length
      )).toBe(0);
      await expect.poll(async () => (await scroll.boundingBox())?.height ?? 0).toBeGreaterThan(48);
      if (locale === "nl" && viewport.width === 640) {
        const ratingHeights = await ratings.getByRole("button").evaluateAll(buttons =>
          buttons.map(button => button.getBoundingClientRect().height)
        );
        expect(Math.min(...ratingHeights)).toBeGreaterThanOrEqual(44);
      }
      expect(await page.locator("html").evaluate(node => node.scrollWidth)).toBe(viewport.width);
      await pressAndWaitForScrollEnd(scroll, "End");
      await expect.poll(() => scroll.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath("short-answer.png") });
    });
  }
}

test("a reverse Face hint remains reachable in its scroll region", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dev/sense-card-gate?prototype=reading&mode=reverse&fixture=long&clean=1");
  await assertTestFontsReady(page);
  const stage = page.getByTestId("training-sense-card-stage");
  const region = page.getByRole("region", { name: "Kaartinhoud", exact: true });
  const hint = region.locator("aside");
  const prompt = stage.getByTestId("reverse-prompt");
  await expect(stage).toHaveAttribute("data-side", "face");
  await expect(prompt).toBeVisible();
  await region.press("End");
  await expect.poll(async () => {
    const promptBox = await prompt.boundingBox();
    const regionBox = await region.boundingBox();
    return promptBox!.y + promptBox!.height <= regionBox!.y + regionBox!.height;
  }).toBe(true);
  await region.press("Home");
  await stage.getByRole("button", { name: "Hint tonen", exact: true }).click();
  await expect(hint).toBeVisible();
  const [promptBox, hintBox] = await Promise.all([prompt.boundingBox(), hint.boundingBox()]);
  expect(hintBox!.y).toBeGreaterThanOrEqual(promptBox!.y + promptBox!.height);
  const dock = stage.getByTestId("training-sense-card-dock");
  const dockBeforeScroll = await dock.boundingBox();
  await region.press("End");
  await expect.poll(async () => {
    const hintBox = await hint.boundingBox();
    const regionBox = await region.boundingBox();
    return hintBox!.y + hintBox!.height <= regionBox!.y + regionBox!.height;
  }).toBe(true);
  expect(await dock.boundingBox()).toEqual(dockBeforeScroll);
  await expect(stage).toHaveAttribute("data-side", "face");
  await expect(stage.getByRole("button", { name: "Antwoord tonen", exact: true })).toBeInViewport();
});

test("the selected translation at the end of a long Answer remains reachable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dev/sense-card-gate?prototype=reading&fixture=long&clean=1");
  await assertTestFontsReady(page);
  const stage = page.getByTestId("training-sense-card-stage");
  await stage.getByRole("button", { name: "Antwoord tonen", exact: true }).click();
  await stage.getByRole("button", { name: "Vertalen", exact: true }).click();
  const scroll = page.getByTestId("training-answer-scroll");
  const headword = stage.getByTestId("sense-card-headword-lockup");
  const dock = stage.getByTestId("training-sense-card-dock");
  const [headwordBefore, dockBefore] = await Promise.all([headword.boundingBox(), dock.boundingBox()]);
  await expect(scroll.getByTestId("training-question-reminder")).toBeVisible();
  const lastTranslation = scroll.locator('[data-content-translation="true"]').last();
  await expect.poll(() => scroll.evaluate(element => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0);
  await scroll.press("End");
  await expect.poll(() => scroll.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThanOrEqual(1);
  const translationBounds = await lastTranslation.evaluate(element => {
    const region = element.closest<HTMLElement>('[data-testid="training-answer-scroll"]')!;
    // A long paragraph may exceed the pane. The scroll contract guarantees
    // access to its final rendered line, rather than fitting all text at once.
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let lastText: Text | null = null;
    while (walker.nextNode()) {
      if (walker.currentNode.textContent?.trim()) lastText = walker.currentNode as Text;
    }
    if (!lastText) throw new Error("Selected translation has no readable text");
    const range = document.createRange();
    range.selectNodeContents(lastText);
    const text = Array.from(range.getClientRects()).at(-1)!;
    const contentTop = region.getBoundingClientRect().top + region.clientTop;
    const contentBottom = contentTop + region.clientHeight;
    return {
      fullyVisible: text.top >= Math.max(0, contentTop) &&
        text.bottom <= Math.min(window.innerHeight, contentBottom) &&
        text.left >= Math.max(0, region.getBoundingClientRect().left) &&
        text.right <= Math.min(window.innerWidth, region.getBoundingClientRect().right),
      textTop: text.top,
      textBottom: text.bottom,
      contentTop,
      contentBottom,
      scrollTop: region.scrollTop,
      scrollHeight: region.scrollHeight,
      clientHeight: region.clientHeight,
    };
  });
  expect(translationBounds.fullyVisible, JSON.stringify(translationBounds)).toBe(true);
  expect((await headword.boundingBox())!.y).toBeLessThan(headwordBefore!.y);
  expect(await dock.boundingBox()).toEqual(dockBefore);
  await scroll.press("Home");
  await expect.poll(() => scroll.evaluate(node => node.scrollTop)).toBe(0);
  await expect(scroll.getByTestId("training-question-reminder")).toBeInViewport();
});

test("front prompt stays centred when the hint opens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dev/sense-card-gate?prototype=reading&mode=reverse&clean=1");
  await assertTestFontsReady(page);
  const stage = page.getByTestId("training-sense-card-stage");
  const prompt = stage.getByTestId("reverse-prompt");
  const region = stage.getByTestId("training-face-scroll");
  const before = await prompt.boundingBox();
  const area = await region.boundingBox();
  expect(Math.abs(before!.y + before!.height / 2 - area!.y - area!.height / 2)).toBeLessThan(2);
  await stage.getByRole("button", { name: "Hint tonen", exact: true }).click();
  await expect(region.locator("aside")).toBeVisible();
  const after = await prompt.boundingBox();
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(1);
});

test('short answer remains readable when the question reminder is disabled', async ({page}) => {
  await page.setViewportSize({width:640,height:400});
  await page.emulateMedia({reducedMotion:'reduce'});
  await setupAuthenticatedTrainingAttributionPage(page, 0, {
    visualProfile:'long-idiom',
    settingsOverrides:{reading_size_phone:'extra',reading_size_desktop:'extra',training_show_question_on_answer:false,preferences:{onboardingCompleted:true,onboardingLanguage:'en'}},
  });
  await assertTestFontsReady(page);
  await page.getByRole('button',{name:'Start training'}).click();
  await page.getByRole('button',{name:'Show answer'}).click();
  await expect(page.getByTestId('training-question-reminder')).toHaveCount(0);
  const reading=page.getByTestId('training-answer-scroll');
  expect((await reading.boundingBox())!.height).toBeGreaterThan(80);
  await reading.press('End');
  await expect.poll(()=>reading.evaluate(element=>element.scrollHeight-element.clientHeight-element.scrollTop)).toBeLessThanOrEqual(1);
  await expect(page.getByTestId('training-review-grid')).toBeInViewport({ratio:1});
});

test('a long reverse question and answer remain reachable in a short viewport', async ({page}) => {
  await page.setViewportSize({width:320,height:568});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/dev/sense-card-gate?prototype=reading&mode=reverse&fixture=long&clean=1');
  await assertTestFontsReady(page);
  const stage=page.getByTestId('training-sense-card-stage');
  const prompt=await stage.getByTestId('reverse-prompt').innerText();
  await stage.getByRole('button',{name:'Antwoord tonen',exact:true}).click();
  const reading=page.getByTestId('training-answer-scroll');
  const reminder=reading.getByTestId('training-question-reminder');
  await expect(reminder).toContainText(prompt);
  expect(await reminder.evaluate(element=>element.scrollHeight)).toBeGreaterThan(80);
  await reading.press('End');
  await expect.poll(()=>reading.evaluate(element=>element.scrollHeight-element.clientHeight-element.scrollTop)).toBeLessThanOrEqual(1);
  await reading.press('Home');
  await expect.poll(()=>reading.evaluate(element=>element.scrollTop)).toBe(0);
  await expect(reminder).toBeInViewport();
  await expect(stage.getByTestId('training-sense-card-dock')).toBeInViewport({ratio:1});
});

test('a tall viewport keeps the answer header fixed while its content scrolls', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/dev/sense-card-gate?prototype=reading&fixture=long&clean=1');
  await assertTestFontsReady(page);
  const stage=page.getByTestId('training-sense-card-stage');
  await stage.getByRole('button',{name:'Antwoord tonen',exact:true}).click();
  const reading=page.getByTestId('training-answer-scroll');
  const header=stage.getByTestId('sense-card-headword-lockup');
  const reminder=stage.getByTestId('training-question-reminder');
  const [headerBefore,reminderBefore]=await Promise.all([header.boundingBox(),reminder.boundingBox()]);
  await reading.press('End');
  await expect.poll(()=>reading.evaluate(element=>element.scrollHeight-element.clientHeight-element.scrollTop)).toBeLessThanOrEqual(1);
  expect(await header.boundingBox()).toEqual(headerBefore);
  expect(await reminder.boundingBox()).toEqual(reminderBefore);
});
