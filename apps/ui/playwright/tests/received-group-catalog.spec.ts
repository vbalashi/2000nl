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

for(const width of [350,390,705,1200])for(const theme of ['light','dark'])test(`shared publication rows stay readable ${width} ${theme} @received-group-catalog`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.goto('/dev/search-boundary-preview');
 await page.getByRole('button',{name:`Use ${theme} theme`}).click();
 const owned=page.getByTestId('owned-row-preview');
 const group=owned.getByRole('button',{name:'Owned 333',exact:true});
 const collection=owned.getByRole('button',{name:'A long collection title about housing and living abroad',exact:true});
 const names=await Promise.all([group.boundingBox(),collection.boundingBox()]);
 expect(names[0]!.width).toBeGreaterThan(50);
 expect(names[1]!.width).toBeGreaterThan(70);
 expect(Math.abs(names[0]!.x-names[1]!.x)).toBeLessThan(1);
 for(const name of [group,collection]){
  const row=name.locator('xpath=ancestor::*[@role="row"][1]');
  const geometry=await row.evaluate(e=>({height:e.getBoundingClientRect().height,overflow:e.scrollWidth>e.clientWidth+1}));
  expect(geometry.height).toBeLessThan(140);expect(geometry.overflow).toBe(false);
 }
 if(width<=700){
  const received=page.getByTestId('received-row-preview');
  const receivedNames=[received.getByRole('button',{name:'333',exact:true}),received.getByRole('button',{name:'firstXXX',exact:true})];
  for(const name of [group,collection,...receivedNames]){
   const geometry=await name.evaluate(e=>{const row=e.closest('[role="row"],article')!;const style=getComputedStyle(row);return {padding:style.paddingInlineStart,height:row.getBoundingClientRect().height,columns:style.gridTemplateColumns};});
   expect(geometry.padding).toBe('4px');expect(geometry.height).toBeGreaterThanOrEqual(64);expect(geometry.columns.split(' ')).toHaveLength(2);
  }
 }
 const actions=await Promise.all(['More actions: Owned 333','More actions · A long collection title about housing and living abroad'].map(name=>owned.getByRole('button',{name,exact:true}).boundingBox()));
 expect(Math.abs(actions[0]!.x+actions[0]!.width/2-actions[1]!.x-actions[1]!.width/2)).toBeLessThan(1);
 if(width>700){
  const heading=owned.getByRole('columnheader',{name:'More actions',exact:true});
  expect(await heading.evaluate(e=>getComputedStyle(e).textAlign)).toBe('end');
  const box=await heading.boundingBox();expect(Math.abs(box!.x+box!.width-actions[0]!.x-actions[0]!.width)).toBeLessThan(1);
 }
 for(const name of ['More actions: Owned 333','More actions · A long collection title about housing and living abroad']){
  const style=await owned.getByRole('button',{name,exact:true}).evaluate(e=>({border:getComputedStyle(e).borderTopWidth,background:getComputedStyle(e).backgroundColor}));
  expect(style.border).toBe('0px');expect(style.background).toBe('rgba(0, 0, 0, 0)');
  const menu=owned.getByRole('button',{name,exact:true});await menu.hover();expect(await menu.evaluate(e=>getComputedStyle(e).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');await page.mouse.move(0,0);
 }

});
