import {expect,test} from '@playwright/test';
import {setupAuthenticatedTrainingAttributionPage} from '../support/trainingAttributionHarness';

test('Pixel-sized builder scrolls its content with actions and app chrome in place; saved list shows both scroll edges',async({page},info)=>{
 await page.setViewportSize({width:412,height:750});
 await setupAuthenticatedTrainingAttributionPage(page,0,{devTestLogin:false,visualProfile:'answer',settingsOverrides:{preferences:{onboardingLanguage:'en'}}});
 const draft={family:'meaning',scenarioId:'understanding',modes:['word-to-definition'],cardFilter:'both',listValue:'curated:list-attribution',materialMode:'collection',newReviewRatio:2,dateWindow:'all',sourceValue:'all',sessionSize:5};
 const trainings=Array.from({length:40},(_,index)=>({id:`scroll-${index}`,name:`Saved ${index}`,languageCode:'nl',draft}));
 await page.route('**/api/training/setups',route=>route.fulfill({json:{revision:1,document:{schemaVersion:1,mainTrainingId:'scroll-0',trainings}}}));
 await page.route('**/api/training/availability',route=>route.fulfill({json:{dueToday:1,totalReviews:4,newCards:6,totalWords:10,totalMeanings:12,totalCards:16,studyDay:new Date().toISOString().slice(0,10),timezone:'Europe/Amsterdam',asOf:new Date().toISOString()}}));
 await page.reload();
 const saved=page.getByRole('region',{name:'Saved Trainings'});
 const list=saved.locator('[tabindex="0"]');
 await expect(saved.getByRole('button',{name:'More saved trainings'})).toBeVisible();
 await expect(saved.getByRole('button',{name:'Previous saved trainings'})).toHaveCount(0);
 await list.hover();await page.mouse.wheel(0,350);
 await expect(saved.getByRole('button',{name:'Previous saved trainings'})).toBeVisible();
 await page.screenshot({path:info.outputPath('saved-top-indicator.png')});
 await page.getByRole('button', { name: 'Create training', exact: true }).click();
 const builder = page.locator('[data-onboarding="builder"]');
 const viewport = builder.locator(':scope > div').first();
 const footer = builder.locator('footer');
 const start = footer.getByRole('button', { name: 'Start training', exact: true });
 const save = footer.getByRole('button', { name: 'Save training', exact: true });
 const summary = viewport.getByRole('region', { name: 'Available for training' }).getByText(
   'Found 10 words with 12 meanings. Available cards: 16.',
   { exact: false },
 );
 const header = page.getByRole('banner');
 const navigation = page.locator('[data-app-mobile-navigation]');
 await start.click({ trial: true });
 const before = { header: await header.boundingBox(), footer: await footer.boundingBox(), navigation: await navigation.boundingBox() };
 expect(before.footer).not.toBeNull();

 await page.getByRole('button', { name: /^Filters / }).click();
 await page.getByRole('button', { name: /^Exercises / }).click();
 await page.getByRole('button', { name: /^Session \d/ }).click();
 await viewport.evaluate(el => { el.scrollTop = 0; });
 await expect(start).toBeInViewport({ ratio: 0.99 });
 await expect(save).toBeInViewport({ ratio: 0.99 });
 await expect(summary).not.toBeInViewport();
 expect(await footer.boundingBox()).toEqual(before.footer);

 await page.screenshot({ path: info.outputPath('builder-expanded-top.png'), animations: 'disabled' });
 await viewport.hover();
 await page.mouse.wheel(0, 1000);
 await expect.poll(() => viewport.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
 await expect(summary).toBeInViewport({ ratio: 0.99 });
 expect(await footer.boundingBox()).toEqual(before.footer);
 expect(await header.boundingBox()).toEqual(before.header);expect(await navigation.boundingBox()).toEqual(before.navigation);
 expect(await page.evaluate(()=>({top:window.scrollY,height:document.documentElement.scrollHeight,viewport:innerHeight}))).toEqual({top:0,height:750,viewport:750});
 expect(await viewport.evaluate(el=>getComputedStyle(el).overscrollBehaviorY)).toBe('contain');
 await page.screenshot({path:info.outputPath('builder-fixed-chrome.png')});
});
