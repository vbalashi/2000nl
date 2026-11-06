import {expect,test} from '@playwright/test';
import {setupAuthenticatedTrainingAttributionPage} from '../support/trainingAttributionHarness';

for(const width of [320,390,1280])test(`combined compact frequency choices persist and remain usable at ${width}px`,async({page},info)=>{
 await page.setViewportSize({width,height:844});
 await setupAuthenticatedTrainingAttributionPage(page,0,{devTestLogin:false,visualProfile:'answer',settingsOverrides:{preferences:{onboardingLanguage:'en'}}});
 await page.route('**/rest/v1/rpc/get_available_dictionary_sources',route=>route.fulfill({json:[{id:'77700000-0000-4000-8000-000000000001',language_code:'nl',slug:'combined-fixture',name:'Fixture dictionary',kind:'curated',entry_count:100}]}));
 const draft={family:'meaning',scenarioId:'understanding',modes:['word-to-definition','definition-to-word'],cardFilter:'both',listValue:'',materialMode:'all-dictionaries',newReviewRatio:2,dateWindow:'all',sourceValue:'all',sessionSize:10,vocabulary:{mode:'frequency',profile:'spoken',from:1,to:100,meanings:'all',materialKinds:[]}};
 let snapshot={revision:1,starterStatus:'complete',document:{schemaVersion:1,mainTrainingId:'combined',trainings:[{id:'combined',name:'Combined release',languageCode:'nl',draft}]}};
 const requests:typeof draft[]=[];
 await page.route('**/api/training/setups',async route=>{
  if(route.request().method()==='PUT'){const body=route.request().postDataJSON();snapshot={...snapshot,revision:snapshot.revision+1,document:body.document};}
  await route.fulfill({json:snapshot});
 });
 await page.route('**/api/training/availability',async route=>{
  requests.push(route.request().postDataJSON().draft);
  await route.fulfill({json:{dueToday:1,totalReviews:4,newCards:30,totalCards:34,totalMeanings:17,totalWords:11,studyDay:'2026-11-06',timezone:'Europe/Amsterdam',asOf:'2026-11-06T00:00:00Z'}});
 });
 const open=async()=>{
  await page.getByRole('button',{name:'Edit Combined release',exact:true}).first().click();
  const filters=page.getByRole('button',{name:/^Filters/});
  if(await filters.getAttribute('aria-expanded')==='false')await filters.click();
 };
 await page.reload();await open();
 await page.getByRole('button',{name:'Written',exact:true}).click();
 await page.getByRole('button',{name:'Top 300',exact:true}).click();
 await page.getByRole('button',{name:'First 5 meanings',exact:true}).click();
 await expect.poll(()=>requests.at(-1)?.vocabulary).toMatchObject({profile:'written',from:1,to:300,meanings:5});
 await expect(page.getByRole('button',{name:'First 5 meanings',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('button',{name:'Written',exact:true})).toHaveAttribute('aria-pressed','true');
 expect(await page.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('compact-filters.png'),fullPage:true});
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect.poll(()=>snapshot.document.trainings[0].draft.vocabulary).toMatchObject({profile:'written',to:300,meanings:5});
 await page.reload();await open();
 await expect(page.getByRole('button',{name:'Written',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('button',{name:'First 5 meanings',exact:true})).toHaveAttribute('aria-pressed','true');
});
