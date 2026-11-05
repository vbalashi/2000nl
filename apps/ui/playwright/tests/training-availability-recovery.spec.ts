import {expect,test} from '@playwright/test';
import {setupAuthenticatedTrainingAttributionPage} from '../support/trainingAttributionHarness';
for(const profile of [{name:'desktop-light',width:1280,height:900,dark:false},{name:'mobile-dark',width:390,height:844,dark:true}])test(`availability pending failure retry ${profile.name}`,async({page},info)=>{
 await page.setViewportSize({width:profile.width,height:profile.height});
 await page.emulateMedia({colorScheme:profile.dark?'dark':'light'});
 await setupAuthenticatedTrainingAttributionPage(page,0,{devTestLogin:false,visualProfile:'answer',settingsOverrides:{preferences:{onboardingLanguage:'en'}}});
 const draft={family:'meaning',scenarioId:'understanding',modes:['word-to-definition'],cardFilter:'both',listValue:'curated:list-attribution',materialMode:'collection',newReviewRatio:2,dateWindow:'all',sourceValue:'all',sessionSize:5,vocabulary:{mode:'frequency',profile:'spoken',from:1,to:100,meanings:'all',materialKinds:[]}};
 await page.route('**/api/training/setups',route=>route.fulfill({json:{revision:1,document:{schemaVersion:1,mainTrainingId:'saved-70',trainings:[{id:'saved-70',name:'Frequency test',languageCode:'nl',draft}]}}}));
 let limitedCalls=0;let fail!:()=>void;const pending=new Promise<void>(resolve=>{fail=resolve;});
 await page.route('**/api/training/availability',async route=>{
  if(route.request().postDataJSON().draft.vocabulary?.meanings!=='all'){
   limitedCalls++;
   if(limitedCalls===1){await pending;await route.fulfill({status:503,json:{error:'training_availability_unavailable'}});return;}
  }
  await route.fulfill({json:{dueToday:1,totalReviews:4,newCards:6,studyDay:new Date().toISOString().slice(0,10),timezone:'Europe/Amsterdam',asOf:new Date().toISOString()}});
 });
 await page.reload();
 await page.getByRole('button',{name:'Edit Frequency test',exact:true}).first().click();
 await page.getByRole('button',{name:/^Filters/}).click();
 await page.getByRole('slider',{name:'Meanings per entry'}).focus();
 await page.getByRole('slider',{name:'Meanings per entry'}).press('Home');
 const strip=page.getByRole('region',{name:'Available for training'});
 await expect(strip.getByRole('status')).toHaveText('Updating card counts…');
 await strip.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('pending.png'),fullPage:true});
 fail();await expect(strip.getByRole('alert')).toContainText('Could not update the card counts.');
 expect(limitedCalls).toBe(1);
 await page.screenshot({path:info.outputPath('failed.png'),fullPage:true});
 await strip.getByRole('button',{name:'Try again'}).click();
 await expect(strip.getByRole('alert')).toHaveCount(0);await expect(strip.getByRole('status')).toBeEmpty();
 await expect.poll(()=>limitedCalls).toBe(2);
});
