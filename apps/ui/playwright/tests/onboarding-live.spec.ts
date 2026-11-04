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
