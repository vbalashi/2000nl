import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// Playwright does not expose iOS safe-area env values. Resolve the iPhone
// inset and standalone conditions in the actual shipped styles for this test.
const frame = readFileSync('components/navigation/AppFrame.module.css', 'utf8');
const sheet = readFileSync('components/practice/article/wordDetailsSheet.module.css', 'utf8');
const resolveIOS = (css: string) => css
  .replace(/env\(safe-area-inset-bottom(?:,\s*0px)?\)/g, '34px')
  .replace(/env\(safe-area-inset-top(?:,\s*0px)?\)/g, '59px')
  .replace(/@supports \(-webkit-touch-callout: none\)/g, '@supports (display: block)')
  .replace(/\(display-mode: standalone\)/g, '(min-width: 0px)');

test('installed iPhone navigation leaves more room for the word sheet', async ({page}) => {
  await page.setViewportSize({width:393,height:852});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setContent(`<style>*{box-sizing:border-box}html,body{margin:0}${resolveIOS(frame)}${resolveIOS(sheet)}</style>
    <div class="frame"><div class="content"></div><div class="tabBar"><nav class="tabBarNav"><button>Training</button><button>Library</button><button>Statistics</button></nav></div><section class="librarySheet"></section></div>`);
  const nav = (await page.locator('.tabBar').boundingBox())!;
  const wordSheet = (await page.locator('.librarySheet').boundingBox())!;
  const buttons = await page.locator('.tabBarNav button').all();
  expect(nav.height).toBeLessThanOrEqual(72);
  const center = (await buttons[1].boundingBox())!;
  expect(852 - center.y - center.height).toBeGreaterThanOrEqual(14);
  for (const button of buttons) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(wordSheet.height).toBeGreaterThanOrEqual(363);
  expect(wordSheet.y + wordSheet.height).toBeLessThanOrEqual(nav.y);
  expect(nav.y - (wordSheet.y + wordSheet.height)).toBeLessThanOrEqual(12);
});

test('ordinary browser and phones without a bottom inset keep their existing spacing', async ({page}) => {
  await page.setViewportSize({width:375,height:667});
  // An ordinary browser does not match the standalone condition.
  const ordinary = frame.replace(/env\(safe-area-inset-bottom(?:,\s*0px)?\)/g, '34px');
  await page.setContent(`<style>*{box-sizing:border-box}html,body{margin:0}${ordinary}</style><div class="frame"><div class="content"></div><div class="tabBar"><nav class="tabBarNav"><button>Training</button></nav></div></div>`);
  expect((await page.locator('.tabBar').boundingBox())!.height).toBe(95);
  // Older iPhones have no home indicator inset, so no negative offset is applied.
  const noInset = resolveIOS(frame).replace(/34px/g, '0px');
  await page.setContent(`<style>*{box-sizing:border-box}html,body{margin:0}${noInset}</style><div class="frame"><div class="content"></div><div class="tabBar"><nav class="tabBarNav"><button>Training</button></nav></div></div>`);
  expect((await page.locator('.tabBar').boundingBox())!.height).toBe(61);
});
