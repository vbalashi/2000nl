import {writeFile} from 'node:fs/promises';
import {expect,test} from '@playwright/test';
import {setupAuthenticatedTrainingAttributionPage} from '../support/trainingAttributionHarness';

for(const profile of [{name:'desktop-en',width:1280,height:900,language:'en'},{name:'mobile-ru390',width:390,height:844,language:'ru'},{name:'mobile-ru320',width:320,height:740,language:'ru'}])test(`saved builder identity and footer ${profile.name}`,async({page},info)=>{
 await page.setViewportSize({width:profile.width,height:profile.height});
 await setupAuthenticatedTrainingAttributionPage(page,0,{devTestLogin:false,visualProfile:'answer',settingsOverrides:{preferences:{onboardingLanguage:profile.language}}});
 const draft={family:'meaning',scenarioId:'understanding',modes:['word-to-definition'],cardFilter:'both',listValue:'curated:list-attribution',materialMode:'collection',newReviewRatio:2,dateWindow:'all',sourceValue:'all',sessionSize:5};
 let snapshot={revision:1,document:{schemaVersion:1,mainTrainingId:'saved-575',trainings:[{id:'saved-575',name:'Original 575',languageCode:'nl',draft}]}};
 const mutations:typeof snapshot.document[]=[];
 await page.route('**/api/training/setups',async route=>{if(route.request().method()==='PUT'){const body=route.request().postDataJSON();mutations.push(body.document);snapshot={revision:snapshot.revision+1,document:body.document};}await route.fulfill({json:snapshot});});
 await page.route('**/api/training/availability',route=>route.fulfill({json:{dueToday:1,totalReviews:4,newCards:6,totalWords:10,totalMeanings:12,totalCards:16,studyDay:new Date().toISOString().slice(0,10),timezone:'Europe/Amsterdam',asOf:new Date().toISOString()}}));
 await page.reload();const ru=profile.language==='ru';
 await page.getByRole('button',{name:ru?'Изменить «Original 575»':'Edit Original 575',exact:true}).first().click();
 const dirty=page.getByRole('status',{name:ru?'Несохранённые изменения':'Unsaved changes'});await expect(dirty).toHaveCount(0);
 await page.getByRole('button',{name:ru?'Название тренировки':'Training name',exact:true}).click();
 const name=page.getByRole('textbox',{name:ru?'Название тренировки':'Training name'});await expect(name).toHaveValue('Original 575');await name.fill('Renamed 575');await expect(dirty).toBeVisible();
 const footer=page.locator('footer').filter({has:page.getByRole('button',{name:ru?'Сохранить изменения':'Save changes',exact:true})});
 const update=footer.getByRole('button',{name:ru?'Сохранить изменения':'Save changes',exact:true}),remove=footer.getByRole('button',{name:ru?'Удалить тренировку':'Delete training',exact:true}),dropdown=footer.locator('summary');
 const counts=page.getByRole('region',{name:ru?'Доступно для тренировки':'Available for training',exact:true});
 const geometry={saveControl:await update.locator("..").boundingBox(),update:await update.boundingBox(),remove:await remove.boundingBox(),dropdown:await dropdown.boundingBox(),footer:await footer.boundingBox()};
 expect(geometry.saveControl!.height).toBe(ru ? 44 : 36);expect(geometry.update!.height).toBe(ru ? 44 : 36);
 const startBox=await footer.locator("button").first().boundingBox();
 if (ru) {
   expect(startBox!.x + startBox!.width).toBeLessThanOrEqual(geometry.update!.x);
   expect(Math.abs(startBox!.y - geometry.update!.y)).toBeLessThanOrEqual(2);
   expect(geometry.saveControl!.width).toBeLessThan(88);
 } else {
   expect(startBox!.y + startBox!.height).toBeLessThan(geometry.update!.y);
   expect(startBox!.width).toBeGreaterThan(geometry.saveControl!.width);
   expect(Math.abs(geometry.remove!.y + geometry.remove!.height / 2 - geometry.update!.y - geometry.update!.height / 2)).toBeLessThanOrEqual(2);
 }
expect(geometry.remove!.width).toBeGreaterThanOrEqual(32);expect(geometry.dropdown!.width).toBeGreaterThanOrEqual(28);
 expect(geometry.remove!.x+geometry.remove!.width).toBeLessThanOrEqual(geometry.update!.x);expect(geometry.dropdown!.x).toBeGreaterThanOrEqual(geometry.update!.x+geometry.update!.width-1);
 expect(await footer.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);expect(await page.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 const summary = counts.locator('p[aria-live="polite"]').filter({hasText:'16'});
 await expect(summary).toBeVisible();
 expect(startBox!.y - (await summary.boundingBox())!.y - (await summary.boundingBox())!.height).toBeLessThanOrEqual(12);
 await page.screenshot({path:info.outputPath('builder-footer.png')});
 const start = footer.getByRole('button', { name: ru ? 'Начать тренировку' : 'Start training', exact: true });
 if (profile.width === 320 || !ru) {
   await page.setViewportSize({ width: profile.width, height: 568 });
   const filters = page.locator('[data-builder-section="filters"]');
   const builder = page.locator('[data-onboarding="builder"]');
   const desktop = profile.width >= 768;
   const scrollArea = desktop ? builder.locator('[data-builder-fields]') : builder.locator(':scope > div').first();
   const session = page.locator('[data-builder-section="session"]');
   await start.click({ trial: true });
   const before = await footer.boundingBox();
   const summaryBefore = await summary.boundingBox();
   expect(before).not.toBeNull();

   await filters.click();
   await session.click();
   await expect(filters).toHaveAttribute('aria-expanded', 'true');
   await expect(session).toHaveAttribute('aria-expanded', 'true');
   await scrollArea.evaluate(el => { el.scrollTop = 0; });

   await expect(start).toBeInViewport({ ratio: 0.99 });
   await expect(update).toBeInViewport({ ratio: 0.99 });
   await expect(remove).toBeInViewport({ ratio: 0.99 });
   await expect(dropdown).toBeInViewport({ ratio: 0.99 });
   expect(await footer.boundingBox()).toEqual(before);
   if (!desktop) {
     await expect(summary).not.toBeInViewport();
   } else {
     await expect(summary).toBeInViewport({ ratio: 0.99 });
     expect(await summary.boundingBox()).toEqual(summaryBefore);
   }
   await page.screenshot({ path: info.outputPath('builder-expanded-top.png'), animations: 'disabled' });

   await scrollArea.evaluate(el => { el.scrollTop = el.scrollHeight; });
   expect(await scrollArea.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
   await expect(summary).toBeInViewport({ ratio: 0.99 });
   expect(await footer.boundingBox()).toEqual(before);
   if (desktop) expect(await summary.boundingBox()).toEqual(summaryBefore);
   await page.screenshot({path:info.outputPath('builder-expanded-bottom.png')});

   if (desktop) {
     await page.setViewportSize({ width: 844, height: 390 });
     const compactScrollArea = builder.locator(':scope > div').first();
     await compactScrollArea.evaluate(el => { el.scrollTop = 0; });
     await expect(summary).not.toBeInViewport();
     await expect(start).toBeInViewport({ ratio: 0.99 });
     await page.setViewportSize({ width: profile.width, height: 568 });
     await expect(summary).toBeInViewport({ ratio: 0.99 });
   }
 }

 if (profile.width === 320) {
   const label = start.locator('span');
   await page.setViewportSize({width:280,height:568});
   await expect(start).toHaveAccessibleName('Начать тренировку');
   await expect(label).toHaveCSS('white-space', 'nowrap');
   await expect(label).toHaveCSS('text-overflow', 'ellipsis');
   expect(await label.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
   await page.setViewportSize({ width: profile.width, height: 568 });
 }

 await update.click();await expect.poll(()=>mutations.length).toBe(1);expect(mutations[0].trainings[0]).toMatchObject({id:'saved-575',name:'Renamed 575'});await expect(page.getByRole('dialog')).toHaveCount(0);await expect(dirty).toHaveCount(0);
 await dropdown.focus();await dropdown.press('Enter');const saveAs=ru?'Сохранить как…':'Save as…';const saveAsItem=footer.getByRole('button',{name:saveAs,exact:true});const menuBox=await saveAsItem.boundingBox();expect(menuBox!.x).toBeGreaterThanOrEqual(0);expect(menuBox!.x+menuBox!.width).toBeLessThanOrEqual(profile.width);await saveAsItem.focus();await saveAsItem.press('Enter');
 const copyDialog=page.getByRole('dialog',{name:saveAs});await expect(copyDialog).toBeVisible();const copyBox=await copyDialog.boundingBox();expect(copyBox!.x).toBeGreaterThanOrEqual(0);expect(copyBox!.x+copyBox!.width).toBeLessThanOrEqual(profile.width);await copyDialog.getByRole('textbox').fill('Copy 575');await copyDialog.getByRole('button',{name:saveAs,exact:true}).click();await expect.poll(()=>mutations.length).toBe(2);
 expect(mutations[1].trainings).toHaveLength(2);expect(mutations[1].trainings.find(t=>t.id==='saved-575')?.name).toBe('Renamed 575');const copy=mutations[1].trainings.find(t=>t.name==='Copy 575')!;expect(copy.id).not.toBe('saved-575');await expect(copyDialog).toHaveCount(0);await expect(dropdown).toBeFocused();await expect(page.getByRole('heading',{name:'Copy 575',exact:true})).toBeVisible();
 await remove.click();const deleteDialog=page.getByRole('dialog',{name:ru?'Удалить тренировку?':'Delete training?'});await expect(deleteDialog).toBeVisible();await expect(deleteDialog.getByRole('button',{name:ru?'Отмена':'Cancel'})).toBeFocused();expect(mutations).toHaveLength(2);await expect(deleteDialog).toContainText('Copy 575');await page.screenshot({path:info.outputPath('delete-confirm.png'),fullPage:true});
 await deleteDialog.getByRole('button',{name:ru?'Удалить тренировку':'Delete training',exact:true}).click();await expect.poll(()=>mutations.length).toBe(3);expect(mutations[2].trainings.map(t=>t.id)).toEqual(['saved-575']);const geometryPath=info.outputPath('footer-geometry.json');await writeFile(geometryPath,JSON.stringify(geometry,null,2));await info.attach('footer-geometry',{path:geometryPath,contentType:'application/json'});
});
