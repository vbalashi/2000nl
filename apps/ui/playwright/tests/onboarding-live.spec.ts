import {expect,test} from '@playwright/test';
import {setupAuthenticatedTrainingAttributionPage} from '../support/trainingAttributionHarness';

test('first-use guide starts with languages, pauses, and restores the current topic',async({page})=>{
 await setupAuthenticatedTrainingAttributionPage(page,0,{devTestLogin:false,visualProfile:'answer',settingsOverrides:{preferences:{onboardingCompleted:false,onboardingLanguage:'en'}}});
 await expect(page.getByRole('heading',{name:'Choose your interface language'})).toBeVisible();
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Choose your translation language'})).toBeVisible();
 await page.getByRole('button',{name:'Pause tour',exact:true}).click();
 await expect(page.getByRole('button',{name:'Resume introduction',exact:true})).toBeVisible();
 await page.reload();
 await page.getByRole('button',{name:'Resume introduction',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Choose your interface language'})).toBeVisible();
});

test('existing learner keeps the ordinary overview and can start onboarding from Settings',async({page})=>{
 await setupAuthenticatedTrainingAttributionPage(page,0,{devTestLogin:false,visualProfile:'answer',settingsOverrides:{preferences:{onboardingLanguage:'en'}}});
 await expect(page.locator('[data-onboarding="launch"]')).toBeVisible();
 await expect(page.getByRole('heading',{name:'Choose your interface language'})).toHaveCount(0);
 await page.locator('[data-tour="settings-button"]').click();
 await page.getByRole('button',{name:'Start again',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Choose your interface language'})).toBeVisible();
});

test('guide stays within mobile safe areas and remains scrollable on a short viewport',async({page})=>{
 await page.setViewportSize({width:393,height:852});
 await setupAuthenticatedTrainingAttributionPage(page,0,{devTestLogin:false,visualProfile:'answer',settingsOverrides:{preferences:{onboardingCompleted:false,onboardingLanguage:'en'}}});
 const tooltip=page.locator('[data-training-hotkeys-suspended="true"]');
 await expect(tooltip).toBeVisible();
 // Simulate device insets in browser engines that do not expose a physical notch.
 await page.addStyleTag({content:'[class*="safeArea"] { padding: 59px 0 34px !important; } [data-training-hotkeys-suspended="true"] { max-height: calc(100vh - 117px) !important; }'});
 await page.setViewportSize({width:393,height:400});
 await expect.poll(async()=>{const r=await tooltip.boundingBox();return r&&r.y>=70&&r.y+r.height<=354;}).toBe(true);
 await tooltip.evaluate(el=>{const p=document.createElement('p');p.textContent='Extra content '.repeat(200);el.insertBefore(p,el.lastElementChild);});
 await expect.poll(()=>tooltip.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
 const button=tooltip.getByRole('button',{name:'Continue',exact:true});
 await button.scrollIntoViewIfNeeded();
 await button.click();
 await expect(page.getByRole('heading',{name:'Choose your translation language'})).toBeVisible();
});

test('mobile guide highlights a target inside a dialog and respects reduced motion',async({page})=>{
 await page.setViewportSize({width:393,height:852});
 await page.emulateMedia({reducedMotion:'reduce'});
 await setupAuthenticatedTrainingAttributionPage(page,0,{devTestLogin:false,visualProfile:'answer',settingsOverrides:{preferences:{onboardingCompleted:false,onboardingLanguage:'en'}}});
 await expect(page.getByRole('heading',{name:'Choose your interface language'})).toBeVisible();
 await page.evaluate(()=>{
  const original=document.querySelector<HTMLElement>('[data-onboarding="interface"]')!;
  const host=original.closest('[data-account-palette]')!;
  original.removeAttribute('data-onboarding');
  const dialog=document.createElement('dialog');
  dialog.style.setProperty('--practice-focus',getComputedStyle(original).getPropertyValue('--practice-focus'));
  const target=document.createElement('button');
  target.dataset.onboarding='interface';target.textContent='Dialog target';
  dialog.append(target);host.append(dialog);dialog.showModal();
 });
 const target=page.getByRole('button',{name:'Dialog target'});
 await expect.poll(()=>target.evaluate(el=>Array.from(el.classList).some(name=>name.includes('target')))).toBe(true);
 await expect.poll(()=>target.evaluate(el=>getComputedStyle(el).outlineStyle)).toBe('solid');
 await expect.poll(()=>target.evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 const tooltip=page.locator('[data-training-hotkeys-suspended="true"]');
 await expect(tooltip).toBeVisible();
 const pause=tooltip.getByRole('button',{name:'Pause tour'});
 await expect(pause).toHaveCSS('border-top-width','0px');
 await pause.click();
 await expect.poll(()=>target.evaluate(el=>Array.from(el.classList).some(name=>name.includes('target')))).toBe(false);
});

for(const readingSize of ['largest','extra'])test(`mobile launch guidance leaves the highlighted action tappable (${readingSize})`,async({page})=>{
 await page.setViewportSize({width:393,height:852});
 await setupAuthenticatedTrainingAttributionPage(page,0,{devTestLogin:false,visualProfile:'answer',settingsOverrides:{reading_size_phone:readingSize,reading_size_desktop:readingSize,preferences:{onboardingCompleted:false,onboardingLanguage:'ru'}}});
 const tooltip=page.locator('[data-training-hotkeys-suspended="true"]');
 await expect(tooltip).toBeVisible();
 await tooltip.locator('button').last().click();
 await tooltip.locator('button').last().click();
 await page.locator('[data-onboarding="nav-training"]:visible').click();
 await expect(tooltip).toContainText('4 / 10');
 await page.addStyleTag({content:'[class*="safeArea"] { padding: 59px 0 34px !important; } [data-app-frame] { padding-top: 59px !important; }'});
 await page.setViewportSize({width:393,height:851});
 const launch=page.locator('[data-onboarding="launch"]');
 // Let the floating guide settle after its content, target and safe viewport change.
 await page.waitForTimeout(500);
 await expect.poll(async()=>{
  const action=await launch.boundingBox(),guide=await tooltip.boundingBox();
  return Boolean(action&&guide&&(guide.y+guide.height<=action.y||guide.y>=action.y+action.height||guide.x+guide.width<=action.x||guide.x>=action.x+action.width));
 }).toBe(true);
 await expect.poll(()=>tooltip.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
 await tooltip.locator('p').last().scrollIntoViewIfNeeded();
 // A visible locator alone does not prove that an overlay lets the user tap it.
 await launch.click({trial:true,timeout:5000});
});
