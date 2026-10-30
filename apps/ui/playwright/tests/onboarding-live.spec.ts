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
