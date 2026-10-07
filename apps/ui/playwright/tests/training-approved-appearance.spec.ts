import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";
for (const palette of ["lavender", "blue", "indigo", "graphite"]) {
  for (const mode of ["light", "dark"] as const) {
    for (const size of ["normal", "extra"]) {
      test(`${palette} ${mode} ${size}: Russian compact session retains controls`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: 320, height: 568 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await setupAuthenticatedTrainingAttributionPage(page, 0, {
          visualProfile: "answer",
          settingsOverrides: {
            practice_palette: palette,
            theme_preference: mode,
            reading_size_phone: size,
            reading_size_desktop: size,
            preferences: { onboardingCompleted: true, onboardingLanguage: "ru" },
          },
        });
        await page.getByRole("button", { name: "Начать тренировку", exact: true }).click();
        await expect(page.locator("[data-account-palette]")).toHaveAttribute("data-account-palette", palette);
        await expect(page.locator("[data-reading-size]")).toHaveAttribute("data-reading-size", size);
        await page.getByRole("button", { name: "Показать ответ", exact: true }).click();
        const overlaps = await page.getByTestId("training-answer-header-actions").evaluate(actions => {
          const controls = actions.getBoundingClientRect();
          const metadata = actions.previousElementSibling!;
          return Array.from(metadata.children).some(child => {
            const rect = child.getBoundingClientRect();
            return rect.left < controls.right && rect.right > controls.left && rect.top < controls.bottom && rect.bottom > controls.top;
          });
        });
        expect(overlaps).toBe(false);
        const ratings = page.getByTestId("training-review-grid");
        await expect(ratings).toBeInViewport({ ratio: 1 });
        const boxes = await ratings.locator("button[data-rating]").evaluateAll(elements => elements.map(element => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, bottom: rect.bottom, width: element.clientWidth, scroll: element.scrollWidth };
        }));
        expect(boxes).toHaveLength(4);
        for (const box of boxes) {
          expect(box.left).toBeGreaterThanOrEqual(0);
          expect(box.right).toBeLessThanOrEqual(320);
          expect(box.bottom).toBeLessThanOrEqual(568);
          expect(box.scroll).toBeLessThanOrEqual(box.width);
        }
        expect(await page.locator("html").evaluate(element => element.scrollWidth)).toBe(320);
        await page.screenshot({ path: testInfo.outputPath("compact-answer.png") });
      });
    }
  }
}

test("Indigo follows System appearance and remains restored after reload", async ({page},testInfo)=>{
  await page.setViewportSize({width:1024,height:768});
  await page.emulateMedia({colorScheme:"dark",reducedMotion:"reduce"});
  await setupAuthenticatedTrainingAttributionPage(page,0,{visualProfile:"answer",settingsOverrides:{practice_palette:"indigo",theme_preference:"system"}});
  const appearance=page.locator('[data-account-palette]');
  await expect(appearance).toHaveAttribute('data-account-palette','indigo');
  const canvas=page.getByTestId('app-header');
  await expect.poll(()=>canvas.evaluate(el=>getComputedStyle(el).getPropertyValue('--practice-accent').trim())).toBe('#a5b4fc');
  await page.screenshot({path:testInfo.outputPath('indigo-system-dark.png')});
  await page.emulateMedia({colorScheme:"light"});
  await expect.poll(()=>canvas.evaluate(el=>getComputedStyle(el).getPropertyValue('--practice-accent').trim())).toBe('#4f46e5');
  await page.screenshot({path:testInfo.outputPath('indigo-system-light.png')});
  await page.reload();
  await expect(appearance).toHaveAttribute('data-account-palette','indigo');
  await expect.poll(()=>canvas.evaluate(el=>getComputedStyle(el).getPropertyValue('--practice-accent').trim())).toBe('#4f46e5');
  await page.getByRole('button',{name:'Instellingen',exact:true}).click();
  await page.getByRole('button',{name:'Weergave',exact:true}).click();
  await expect(page.getByRole('button',{name:'Indigo',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:'Blauw',exact:true})).toHaveAttribute('aria-pressed','false');
  await page.screenshot({path:testInfo.outputPath('indigo-settings-desktop-light.png')});
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Weergave',exact:true}).click();
  await expect(page.getByRole('button',{name:'Indigo',exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('indigo-settings-mobile-light.png')});
  await page.emulateMedia({colorScheme:'dark'});
  await expect.poll(()=>canvas.evaluate(el=>getComputedStyle(el).getPropertyValue('--practice-accent').trim())).toBe('#a5b4fc');
  await page.screenshot({path:testInfo.outputPath('indigo-settings-mobile-dark.png')});
});
