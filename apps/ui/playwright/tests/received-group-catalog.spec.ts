import {expect,test} from '@playwright/test';
import {setupAuthenticatedTrainingAttributionPage} from '../support/trainingAttributionHarness';
const groupId='12200000-0000-4000-8000-000000000001';
const lessonId='12200000-0000-4000-8000-000000000002';
for(const width of [350,390,1200])test(`received group uses main catalog at ${width} @received-group-catalog`,async({page})=>{
 test.skip(process.env.NEXT_PUBLIC_LABEL_SHARING_ENABLED!=='true'||process.env.NEXT_PUBLIC_COLLECTION_SHARING_ENABLED!=='true','Dedicated sharing-enabled browser phase');
 await page.setViewportSize({width,height:844});
 await setupAuthenticatedTrainingAttributionPage(page,0,{devTestLogin:false,visualProfile:'answer',settingsOverrides:{preferences:{onboardingLanguage:'en'}}});
 await page.route('**/api/library/collection-labels',route=>route.fulfill({json:{revision:0,labels:[],assignments:[]}}));
 await page.route('**/api/library/label-sharing/catalog',route=>route.fulfill({json:{owned:[],received:[{labelId:groupId,name:'333',collectionCount:1}]}}));
 const requests:URL[]=[];
 await page.route('**/api/library/collections/catalog?*',route=>{
  const url=new URL(route.request().url());requests.push(url);
  return route.fulfill({json:{revision:0,collections:url.searchParams.get('scope')==='group'?[{id:lessonId,name:'Group lesson',createdAt:'2026-01-01T00:00:00Z',ownership:'received',isShared:true,itemCount:2,labelIds:[]}]:[],nextCursor:null}});
 });
 await page.reload();
 const nav=page.locator(width<700?'[data-app-mobile-navigation="tabs"]':'[data-app-primary-navigation="desktop"]');
 await nav.getByRole('button').nth(1).click();
 await page.getByRole('button',{name:'Collections',exact:true}).click();
 const catalog=page.getByTestId('personal-collections');
 if(width<=700){await catalog.getByRole('button',{name:'All collections',exact:true}).filter({visible:true}).click();await page.getByRole('dialog',{name:'Choose a label'}).getByRole('button',{name:'333',exact:true}).click();}
 else await catalog.getByRole('button',{name:'333',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(catalog.getByRole('region',{name:'Collections',exact:true}).getByRole('button',{name:'Group lesson',exact:true})).toBeVisible();
 if(width<=700)await expect(catalog.locator('header').getByRole('button',{name:'333',exact:true}).locator('span')).toBeVisible();
 await expect(catalog.getByRole('button',{name:'New collection',exact:true})).toHaveCount(0);
 await catalog.getByRole('textbox',{name:'Search collections'}).fill('lesson');
 await expect.poll(()=>requests.at(-1)?.searchParams.get('query')).toBe('lesson');
 expect(requests.at(-1)?.searchParams.get('scope')).toBe('group');
 expect(requests.at(-1)?.searchParams.get('labelId')).toBe(groupId);
 expect(requests.at(-1)?.searchParams.get('languageCode')).toBe('nl');
});
