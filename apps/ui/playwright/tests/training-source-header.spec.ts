import {expect,test} from '@playwright/test';
import {setupAuthenticatedTrainingAttributionPage} from '../support/trainingAttributionHarness';

for(const profile of [
 {name:'desktop light',width:1280,height:900,locale:'en',theme:'light',size:'normal'},
 {name:'phone dark',width:390,height:844,locale:'en',theme:'dark',size:'normal'},
 {name:'narrow Russian extra text',width:320,height:844,locale:'ru',theme:'dark',size:'extra'},
] as const){
 test.describe(profile.name,()=>{
  test.use({viewport:{width:profile.width,height:profile.height}});
  test('Source retains the standard header geometry and independent controls',async({page})=>{
   await setupAuthenticatedTrainingAttributionPage(page,0,{devTestLogin:false,visualProfile:'answer',settingsOverrides:{theme_preference:profile.theme,reading_size_phone:profile.size,reading_size_desktop:profile.size,preferences:{onboardingLanguage:profile.locale}}});
   if(profile.size==='extra')await expect(page.locator('[data-text-size="extra"]')).toHaveCount(1);
   await page.getByRole('button',{name:profile.locale==='ru'?'Создать тренировку':'Create training',exact:true}).click();
   const source=page.locator('[data-builder-section="source"]');
   const header=source.locator('../..');
   const summary=header.locator('[data-testid$="-source-summary"]');
   const chosen=await summary.textContent();expect(chosen?.trim()).toBeTruthy();
   const body=page.locator(`[id="${await source.getAttribute('aria-controls')}"]`);
   const search=page.getByRole('button',{name:profile.locale==='ru'?'Поиск источников':'Search sources',exact:true});
   const choices=body.getByRole('group',{name:profile.locale==='ru'?'Тип источника':'Source type',exact:true});
   for(let step=0;step<3;step++){
    const open=step===1;
    await expect(source).toHaveAttribute('aria-expanded',String(open));
    await expect(summary).toHaveText(chosen!);
    expect(await body.evaluate((e,id)=>e.contains(document.getElementById(id!)),await summary.getAttribute('id'))).toBe(false);
    const arrow=await header.locator(':scope > svg').boundingBox();
    const otherArrow=await page.locator('[data-builder-section="exercises"] > svg').boundingBox();
    expect(arrow).not.toBeNull();expect(otherArrow).not.toBeNull();
    expect(Math.abs(arrow!.x-otherArrow!.x)).toBeLessThan(1);
    const bounds=await header.boundingBox();expect(bounds).not.toBeNull();
    if(open){
     await expect(choices).toBeVisible();
     const filters=await choices.boundingBox();expect(filters!.y).toBeGreaterThanOrEqual(bounds!.y+bounds!.height);
    }else await expect(choices).not.toBeVisible();
    if(step<2)await header.click({position:{x:bounds!.width-5,y:bounds!.height/2}});
   }
   await search.click();
   await expect(source).toHaveAttribute('aria-expanded','true');
   const input=page.getByRole('textbox',{name:profile.locale==='ru'?'Поиск источников':'Search sources',exact:true});
   await expect(input).toBeFocused();
   await input.press('Escape');
   await expect(search).toBeFocused();
   await expect(source).toHaveAttribute('aria-expanded','true');
   await expect(summary).toHaveText(chosen!);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  });
 });
}
