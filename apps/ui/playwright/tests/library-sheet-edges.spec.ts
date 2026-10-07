import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";
import { multiSenseBankGroup } from "../../tests/platformV2LibraryFixture";
for (const width of [390,610]) test(`@pilot Library sheet edge gestures at ${width}px`, async ({page}) => {
  await page.setViewportSize({width,height:900});
  await page.emulateMedia({reducedMotion:"reduce"});
  await setupAuthenticatedTrainingAttributionPage(page, 0, {visualProfile:"answer"});
  const respond = async (route: import('@playwright/test').Route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({ json: {
      contractVersion: "platform-lookup-v2", query: body.query ?? "bank",
      request: { contentLanguageCode: body.contentLanguageCode, translationTargetLanguageCode: body.translationTargetLanguageCode, cardTypeId: body.cardTypeId, intent: body.intent },
      groups: [multiSenseBankGroup], page: { selectedTierComplete: true, nextGroupCursor: null },
      librarySearch: { totalGroups: 1, matchingEntryIds: multiSenseBankGroup.entries.flatMap(entry => "entryId" in entry ? [entry.entryId] : []) },
    } });
  };
  await page.route("**/api/library/search", respond);
  await page.route("**/api/platform/v2/lookup", respond);
  await page.locator('[data-app-mobile-navigation="tabs"]').getByRole('button').nth(1).click();
  await page.locator('[data-testid^="library-headword-group-"]').first().click();
  const handle = page.getByRole('button', { name: /Expand word card|Collapse word card|Развернуть карточку слова|Свернуть карточку слова|Woordkaart uitklappen|Woordkaart inklappen/i });
  await expect(handle).toBeVisible();
  const sheet = page.locator('section[data-dragging]');
  await expect(sheet.getByTestId('library-sense-card-group')).toBeVisible();
  await page.waitForTimeout(350); // Allow initial entrance animation before measuring pointer coordinates.
  const height = () => sheet.evaluate(element => element.getBoundingClientRect().height);
  const initial=await height();
  await handle.press('ArrowUp'); await expect.poll(height).toBeCloseTo(initial+40,0);
  await handle.press('ArrowDown'); await expect.poll(height).toBeCloseTo(initial,0);
  await handle.press('End'); await expect.poll(height).toBeCloseTo(820,0);
  await handle.press('Home'); await expect.poll(height).toBeCloseTo(initial,0);
  let box=(await handle.boundingBox())!;
  await page.mouse.move(box.x+80,box.y+14);await page.mouse.down();
  await page.mouse.move(box.x+80,box.y-100,{steps:4});
  await expect(sheet).toHaveAttribute('data-dragging','true');
  await handle.evaluate(el=>el.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:1,isPrimary:true})));
  await page.mouse.up();await expect.poll(height).toBeCloseTo(initial,0);
  await expect(sheet).toHaveAttribute('data-dragging','false');
  box=(await handle.boundingBox())!;
  await page.mouse.move(box.x+80,box.y+14);await page.mouse.down();
  await page.mouse.move(box.x+80,box.y-90,{steps:4});
  await handle.evaluate(el=>el.releasePointerCapture(1));
  await page.mouse.up();await expect.poll(height).toBeCloseTo(initial,0);
  await handle.press('ArrowUp');
  await page.setViewportSize({width,height:430});await expect.poll(height).toBeLessThanOrEqual(350);
  const sheetBox=(await sheet.boundingBox())!;
  const navBox=(await page.locator('[data-app-mobile-navigation="tabs"]').boundingBox())!;
  expect(sheetBox.y).toBeGreaterThanOrEqual(8);expect(sheetBox.y+sheetBox.height).toBeLessThanOrEqual(navBox.y);
  await page.setViewportSize({width,height:900});await handle.press('Home');
  const before=await height();
  const scroll=sheet.locator('[class*="readingRegion"]').first();
  const scrollBox=(await scroll.boundingBox())!;
  await page.mouse.move(scrollBox.x+scrollBox.width/2,scrollBox.y+scrollBox.height/2);
  await page.mouse.wheel(0,240);
  await expect.poll(() => scroll.evaluate(el => { let node: HTMLElement | null = el as HTMLElement; while(node) { if(node.scrollTop > 0) return node.scrollTop; node=node.parentElement; } return 0; })).toBeGreaterThan(0);
  await expect.poll(height).toBeCloseTo(before,0);
  await expect(sheet).toHaveAttribute('data-dragging','false');
});
