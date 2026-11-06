import {expect,test} from '@playwright/test';
import {setupAuthenticatedTrainingAttributionPage} from '../support/trainingAttributionHarness';

for(const width of [320,390,1280])test(`Library compact filters preview, cancel and apply at ${width}px`,async({page},info)=>{
 await page.setViewportSize({width,height:844});
 await page.emulateMedia({reducedMotion:'reduce'});
 await setupAuthenticatedTrainingAttributionPage(page,0,{devTestLogin:false,visualProfile:'answer',settingsOverrides:{preferences:{onboardingLanguage:'en'}}});
 await page.route('**/rest/v1/rpc/get_available_dictionary_sources',route=>route.fulfill({json:[{id:'77700000-0000-4000-8000-000000000001',language_code:'nl',slug:'parity-fixture',name:'Fixture dictionary',kind:'curated',entry_count:100}]}));
 const requests:Record<string,any>[]=[];
 await page.route('**/api/library/search',async route=>{
  const body=route.request().postDataJSON();requests.push(body);
  await route.fulfill({json:{contractVersion:'platform-lookup-v2',query:body.query??'',request:{contentLanguageCode:body.contentLanguageCode,translationTargetLanguageCode:body.translationTargetLanguageCode,cardTypeId:body.cardTypeId,intent:body.intent},groups:[],page:{selectedTierComplete:true,nextGroupCursor:null},librarySearch:{totalGroups:73,totalMeanings:191,matchingEntryIds:[],unavailableEntryCount:0}}});
 });
 await page.reload();
 if(width<701)await page.locator('[data-app-mobile-navigation="tabs"]').getByRole('button').nth(1).click();
 else await page.locator('[data-app-primary-navigation="desktop"]').getByRole('button',{name:'Library',exact:true}).click();
 const open=async()=>{await page.getByRole('button',{name:'Search filters',exact:true}).click();return page.getByRole('dialog',{name:'Library filters'});};
 const choose=async()=>{
  const dialog=page.getByRole('dialog',{name:'Library filters'});
  await dialog.getByRole('button',{name:'By frequency',exact:true}).click();
  for(const name of ['Top 100','Top 200','Top 300','Top 500','Top 1,000'])await expect(dialog.getByRole('button',{name,exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'Written',exact:true}).click();
  await dialog.getByRole('button',{name:'Top 300',exact:true}).click();
  await dialog.getByRole('button',{name:'First 5 meanings',exact:true}).click();
  await expect(dialog.getByRole('slider',{name:'Meanings per entry'})).toHaveCount(0);
  await dialog.getByRole('button',{name:/^Part of speech/}).click();
  await dialog.getByRole('button',{name:'Nouns',exact:true}).click();
  await dialog.getByRole('button',{name:'Noun subfilters'}).click();
  await page.getByRole('menu',{name:'Noun article'}).getByRole('menuitem',{name:'het',exact:true}).click();
  await expect.poll(()=>requests.filter(r=>r.countOnly).at(-1)?.filters).toMatchObject({parts:['noun'],article:'het',vocabulary:{mode:'frequency',profile:'written',from:1,to:300,meanings:5}});
 };
 await open();const before=requests.filter(r=>!r.countOnly).length;
 await choose();await page.getByRole('dialog',{name:'Library filters'}).getByRole('button',{name:'Cancel',exact:true}).click();
 expect(requests.filter(r=>!r.countOnly)).toHaveLength(before);
 const dialog=await open();await expect(dialog.getByRole('button',{name:'All words',exact:true})).toHaveAttribute('aria-pressed','true');
 await choose();await dialog.getByRole('button',{name:'Show results',exact:true}).click();
 await expect.poll(()=>requests.filter(r=>!r.countOnly).at(-1)?.filters).toMatchObject({parts:['noun'],article:'het',vocabulary:{profile:'written',to:300,meanings:5}});
 await open();await expect(dialog.getByRole('button',{name:'Written',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(dialog.getByRole('button',{name:'First 5 meanings',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(dialog.getByRole('status')).toHaveText('73 articles · 191 meanings');
 await dialog.getByRole('button',{name:'First 5 meanings',exact:true}).scrollIntoViewIfNeeded();
 const box=(await dialog.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('library-compact-filters.png'),fullPage:true});
 await dialog.getByRole('button',{name:'Show results',exact:true}).click();await expect(dialog).toBeHidden();
});
