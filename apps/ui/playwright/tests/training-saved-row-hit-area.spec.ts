import {expect,test} from '@playwright/test';
import {setupAuthenticatedTrainingAttributionPage} from '../support/trainingAttributionHarness';

for (const profile of [{name:'desktop light',width:1280,height:900,theme:'light'},{name:'narrow dark touch',width:390,height:844,theme:'dark'}] as const) {
 test.describe(profile.name,()=>{
  test.use({viewport:{width:profile.width,height:profile.height},hasTouch:true});
  test('saved row padding selects, while Edit remains independent',async({page})=>{
   await setupAuthenticatedTrainingAttributionPage(page,0,{devTestLogin:false,visualProfile:'answer',settingsOverrides:{theme_preference:profile.theme,preferences:{onboardingLanguage:'en'}}});
   const draft={family:'meaning',scenarioId:'understanding',modes:['word-to-definition'],cardFilter:'both',listValue:'curated:list-attribution',materialMode:'collection',newReviewRatio:2,dateWindow:'all',sourceValue:'all',sessionSize:5};
   const trainings=['Alpha','Beta'].map((name,index)=>({id:`saved-${index}`,name,languageCode:'nl',draft}));
   await page.route('**/api/training/setups',route=>route.fulfill({json:{revision:1,document:{schemaVersion:1,mainTrainingId:'saved-0',trainings}}}));
   await page.route('**/api/training/availability',route=>route.fulfill({json:{dueToday:1,totalReviews:5,newCards:1,studyDay:'2026-11-05',timezone:'UTC',asOf:new Date().toISOString()}}));
   await page.reload();
   const alpha=page.getByRole('button',{name:'Load Alpha',exact:true});
   const beta=page.getByRole('button',{name:'Load Beta',exact:true});
   await expect(alpha).toHaveAttribute('aria-pressed','true');
   const row=page.getByRole('heading',{name:'Beta',level:3}).locator('../..');
   for(const edge of ['top','bottom','summary'] as const){
    await alpha.click();await expect(beta).toHaveAttribute('aria-pressed','false');
    await row.scrollIntoViewIfNeeded();const box=await row.boundingBox();expect(box).not.toBeNull();
    const x=box!.x+12,y=box!.y+(edge==='top'?2:edge==='bottom'?box!.height-3:box!.height/2);
    if(profile.theme==='dark')await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);
    await expect(beta).toHaveAttribute('aria-pressed','true');
    await expect(page.getByRole('heading',{name:'Beta',level:2})).toBeVisible();
   }
   await alpha.click();
   const title=page.getByRole('button',{name:'Beta',exact:true});
   await title.focus();await page.keyboard.press('Enter');await expect(beta).toHaveAttribute('aria-pressed','true');
   await alpha.click();await title.focus();await page.keyboard.press('Space');await expect(beta).toHaveAttribute('aria-pressed','true');
   await alpha.click();
   await page.getByRole('button',{name:'Edit Beta',exact:true}).click();
   await expect(page.getByRole('heading',{name:'Session builder'})).toBeVisible();
   await page.getByRole('button',{name:'Back',exact:true}).click();
   await expect(alpha).toHaveAttribute('aria-pressed','true');
   await expect(beta).toHaveAttribute('aria-pressed','false');
   await expect(page.locator('article')).toHaveCount(0);
  });
 });
}
