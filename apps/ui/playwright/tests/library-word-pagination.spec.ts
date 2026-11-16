import {expect,test} from '@playwright/test';
import {setupAuthenticatedTrainingAttributionPage} from '../support/trainingAttributionHarness';
import {buildFakeSupabaseSession,installSupabaseSession} from '../utils/supabaseTestSession';
import {multiSenseBankGroup} from '../../tests/platformV2LibraryFixture';

const userId='11000000-0000-4000-8000-000000000001';
function article(i:number){
 const group=structuredClone(multiSenseBankGroup);
 group.headwordGroupId=`article-${i}`;group.header.text=`fiets${i}`;
 group.entries=group.entries.map((entry,j)=>({...entry,entryId:`meaning-${i}-${j}`,translation:null,capabilities:[]}));
 return group;
}
for(const mobile of [false,true])test(`Library Words pages, retry and revocation ${mobile?'mobile':'desktop'} @pilot`,async({page})=>{
 await page.setViewportSize(mobile?{width:390,height:844}:{width:1280,height:900});
 await setupAuthenticatedTrainingAttributionPage(page,0,{deferNavigation:true,userId,visualProfile:'answer',settingsOverrides:{preferences:{onboardingLanguage:'en'}}});
 await installSupabaseSession(page,buildFakeSupabaseSession({id:userId,email:'reader@fixture.local'}));
 const requests:{cursor:string|null;limit:number}[]=[],batches:string[][]=[];
 let continuationError:503|404|null=null;
 const all=Array.from({length:50},(_,i)=>article(i)).flatMap(group=>group.entries.map(entry=>({headwordGroupId:group.headwordGroupId,resultKey:entry.kind==='sense-card'?entry.entryId:entry.crossReferenceId,entry:{id:entry.kind==='sense-card'?entry.entryId:entry.crossReferenceId,headword:group.header.text},field:{text:'Voorbeeld fiets'}})));
 const response=(groups:ReturnType<typeof article>[])=>({contractVersion:'platform-lookup-v2',query:'',request:{contentLanguageCode:'nl',translationTargetLanguageCode:null,cardTypeId:'word-to-definition',intent:'dictionary-lookup'},groups,page:{selectedTierComplete:true,nextGroupCursor:null}});
 await page.route('**/api/library/search',route=>route.fulfill({json:{...response([article(0)]),librarySearch:{totalGroups:50,totalMeanings:100,matchingEntryIds:all.map(hit=>hit.entry.id)}}}));
 await page.route('**/api/library/category-search',async route=>{
  const body=route.request().postDataJSON();requests.push({cursor:body.cursor,limit:body.limit});
  if(body.cursor&&continuationError){await route.fulfill({status:continuationError,json:{error:continuationError===404?'material_not_accessible':'temporary'}});continuationError=null;return;}
  const start=Number(body.cursor??0),items=all.slice(start,start+body.limit),next=start+items.length;
  await route.fulfill({json:{groups:[{id:body.group,total:100,wordGroupCount:50,items,page:{hasMore:next<100,nextCursor:next<100?String(next):null}}]}});
 });
 await page.route('**/api/library/articles',route=>{const body=route.request().postDataJSON();batches.push(body.entryIds);return route.fulfill({json:response(body.entryIds.map((id:string)=>article(Number(id.split('-')[1]))))});});
 await page.route('**/api/platform/v2/lookup',route=>{const body=route.request().postDataJSON();return body.entryId?.startsWith('meaning-')?route.fulfill({json:response([article(Number(body.entryId.split('-')[1]))])}):route.fallback();});
 await page.goto('/');
 await page.locator('nav[aria-label="Primary"]:visible').getByRole('button',{name:'Library',exact:true}).click();
 await page.locator('[data-testid="library-workspace"] input[placeholder="Find a word…"]:visible').fill('fiets');
 const rows=page.locator('[data-testid="library-headword-group-row"]:visible');
 await expect(rows).toHaveCount(13);
 await expect(page.locator('[data-count-detail="50 articles · 100 meanings"]')).toBeVisible();
 expect(requests).toEqual([{cursor:null,limit:25}]);expect(batches).toHaveLength(1);expect(batches[0]).toHaveLength(13);
 continuationError=503;
 await page.getByRole('button',{name:'More 25',exact:true}).click();await expect(page.locator('#library-search-results').getByRole('alert')).toBeVisible();
 await expect(rows).toHaveCount(13);
 await page.locator('#library-search-results').getByRole('button',{name:'Retry',exact:true}).click();await expect(rows).toHaveCount(25);
 expect(batches).toHaveLength(2);expect(new Set(batches.flat()).size).toBe(25);
 await expect(page.locator('[data-count-detail="50 articles · 100 meanings"]')).toBeVisible();
 continuationError=404;
 await page.getByRole('button',{name:'More 25',exact:true}).click();await expect(rows).toHaveCount(0);
 await expect(page.getByRole('button',{name:'More 25',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Examples',exact:true}).click();await expect(page.locator('#library-search-results')).toHaveAttribute('aria-busy','false');
 await page.getByRole('button',{name:'Words',exact:true}).last().click();await expect(rows).toHaveCount(13);
 expect(requests.filter(request=>request.cursor===null)).toHaveLength(3);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
