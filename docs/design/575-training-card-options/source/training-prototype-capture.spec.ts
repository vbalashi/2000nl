// THROWAWAY visual capture, no production mutations.
import {test} from '@playwright/test';
import {setupAuthenticatedTrainingAttributionPage} from '../support/trainingAttributionHarness';
for(const width of [390,1280])for(const variant of ['A','B','C'])test(`capture ${variant} ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:width===390?844:900});
 await setupAuthenticatedTrainingAttributionPage(page,0,{devTestLogin:false,visualProfile:'answer',settingsOverrides:{preferences:{onboardingLanguage:'en'}}});
 await page.goto(`/?trainingPrototype=${variant}`);
 await page.getByRole('button',{name:'Load training 2',exact:true}).waitFor();
 await page.screenshot({path:info.outputPath('preview.png')});
 console.log(variant,width,await page.getByRole('region',{name:'Selected training preview'}).boundingBox());
 const row=page.getByRole('button',{name:'Load training 34',exact:true});await row.scrollIntoViewIfNeeded();await row.click();await page.waitForTimeout(1300);console.log('after34',await page.getByRole('region',{name:'Selected training preview'}).boundingBox());await page.screenshot({path:info.outputPath('selected34.png')});
 if(variant==='B'&&width===390){await page.getByRole('button',{name:'Load training 2',exact:true}).click();await page.screenshot({path:info.outputPath('loading.png')});await page.getByRole('button',{name:'No saved',exact:true}).click();await page.screenshot({path:info.outputPath('empty.png')});}
});
