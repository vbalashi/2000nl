import {readFileSync} from 'node:fs';
import {expect,test} from '@playwright/test';
import {setupAuthenticatedTrainingAttributionPage} from '../support/trainingAttributionHarness';

// Device emulation reports zero env() insets. Resolve OS values in the shipped
// stylesheet to catch geometry errors that viewport-only mobile tests miss.
test.use({hasTouch:true});
const css=readFileSync('components/practice/ui/practicePanel.module.css','utf8');
for(const device of [
 {name:'iPhone portrait',width:393,height:852,top:59,bottom:34,left:0,right:0},
 {name:'iPhone short portrait',width:375,height:667,top:20,bottom:0,left:0,right:0},
 {name:'iPhone landscape',width:852,height:393,top:0,bottom:21,left:59,right:59},
])test(`${device.name}: panel controls stay inside OS safe areas`,async({page})=>{
 await page.setViewportSize(device);
 await page.emulateMedia({reducedMotion:'reduce'});
 const insets:Record<string,number>={top:device.top,bottom:device.bottom,left:device.left,right:device.right};
 const resolved=css.replace(/env\(safe-area-inset-(top|bottom|left|right)(?:,\s*0px)?\)/g,(_,edge)=>`${insets[edge]}px`);
 await page.setContent(`<style>*{box-sizing:border-box}body{margin:0}${resolved}</style>
 <dialog class="panel"><header class="heading"><button class="close">Close</button></header>
 <div class="body"><div style="overflow:auto">${'<p>Meaning and examples</p>'.repeat(100)}</div></div></dialog>`);
 await page.locator('dialog').evaluate((el:HTMLDialogElement)=>el.showModal());
 const close=page.getByRole('button',{name:'Close'});
 const box=(await close.boundingBox())!;
 expect(box.y).toBeGreaterThanOrEqual(device.top);
 expect(box.x).toBeGreaterThanOrEqual(device.left);
 expect(box.x+box.width).toBeLessThanOrEqual(device.width-device.right);
 const panel=(await page.locator('dialog').boundingBox())!;
 expect(panel.y).toBeGreaterThanOrEqual(device.top);
 expect(panel.y+panel.height).toBeLessThanOrEqual(device.height);
 await close.evaluate(el=>el.addEventListener('click',()=>el.closest('dialog')!.close()));
 await close.tap();
 await expect(page.locator('dialog')).not.toBeVisible();
});

test('training word panel closes by touch and preserves the current answer with iPhone insets',async({page})=>{
 await page.setViewportSize({width:393,height:852});
 await page.emulateMedia({reducedMotion:'reduce'});
 await setupAuthenticatedTrainingAttributionPage(page,0,{visualProfile:'answer',settingsOverrides:{preferences:{onboardingCompleted:true,onboardingLanguage:'en'}}});
 await page.getByRole('button',{name:/Start training/i}).click();
 await page.getByRole('button',{name:/Show answer/i}).click();
 const stage=page.getByTestId('training-sense-card-stage');
 const opener=stage.getByRole('button',{name:/Word details/i});
 await opener.click();
 const panel=page.getByRole('dialog',{name:/Word details/i});
 await expect(panel.locator('[data-expanded="true"]')).toHaveCount(1);
 // Apply the actual panel CSS to its CSS-module class, substituting only OS env values.
 const className=await panel.getAttribute('class');
 const selector=`.${className!.split(' ')[0]}`;
 await page.addStyleTag({content:css.replace(/\.panel\b/g,selector).replace(/env\(safe-area-inset-(top|bottom|left|right)(?:,\s*0px)?\)/g,(_,edge)=>edge==='top'?'59px':edge==='bottom'?'34px':'0px')});
 const close=panel.getByRole('button',{name:'Close',exact:true});
 for(const height of [852,740]){
  await page.setViewportSize({width:393,height});
  await expect.poll(async()=>(await panel.boundingBox())!.y).toBeGreaterThanOrEqual(59);
  await expect.poll(async()=>(await close.boundingBox())!.y).toBeGreaterThanOrEqual(59);
  await expect(close).toBeInViewport({ratio:1});
 }
 await close.tap();
 await expect(panel).toHaveCount(0);
 await expect(opener).toBeFocused();
 await expect(stage).toHaveAttribute('data-side','answer');
});
