import {expect,test} from '@playwright/test';
import {setupAuthenticatedTrainingAttributionPage} from '../support/trainingAttributionHarness';
import {multiSenseBankGroup} from '../../tests/platformV2LibraryFixture';
for(const profile of [{name:'mobile-ru',width:320,height:740,language:'ru'},{name:'desktop-en',width:1280,height:900,language:'en'}])test(`selected article and meaning counts ${profile.name}`,async({page},info)=>{
 await page.setViewportSize({width:profile.width,height:profile.height});
 await setupAuthenticatedTrainingAttributionPage(page,0,{devTestLogin:false,visualProfile:'answer',settingsOverrides:{preferences:{onboardingLanguage:profile.language}}});
 await page.route('**/api/library/search',async route=>{
  const body=route.request().postDataJSON();
  await route.fulfill({json:{contractVersion:'platform-lookup-v2',query:body.query,request:{contentLanguageCode:body.contentLanguageCode,translationTargetLanguageCode:body.translationTargetLanguageCode,cardTypeId:body.cardTypeId,intent:body.intent},groups:body.countOnly?[]:[multiSenseBankGroup],page:{selectedTierComplete:true,nextGroupCursor:null},librarySearch:{totalGroups:73,totalMeanings:115,matchingEntryIds:body.countOnly?[]:multiSenseBankGroup.entries.flatMap(entry=>'entryId'in entry?[entry.entryId]:[])}}});
 });
 await page.reload();
 const nav=page.locator(profile.width<700?'[data-app-mobile-navigation="tabs"]':'[data-app-primary-navigation="desktop"]');
 await nav.getByRole('button').nth(1).click();
 const label=profile.language==='ru'?'73 статьи · 115 значений':'73 articles · 115 meanings';
 await expect(page.getByText(label,{exact:true})).toBeVisible();
 const counter=page.getByText(label,{exact:true});
 expect(await counter.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 expect(await page.getByTestId('library-workspace').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('dual-count.png'),fullPage:true});
});
