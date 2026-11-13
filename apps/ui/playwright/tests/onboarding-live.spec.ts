import {expect,test,type Locator} from '@playwright/test';
import {tourCopy,tourFlows} from '../../lib/onboarding/model';
import {setupAuthenticatedTrainingAttributionPage} from '../support/trainingAttributionHarness';

async function expectTourActionAccessible(guide:Locator,action:Locator){
 await expect.poll(async()=>{
  const g=await guide.evaluate(el=>{
   const r=el.getBoundingClientRect();let top=r.top,bottom=r.bottom,left=r.left,right=r.right;
   for(let parent=el.parentElement;parent;parent=parent.parentElement){const s=getComputedStyle(parent),p=parent.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(s.overflowY)){top=Math.max(top,p.top);bottom=Math.min(bottom,p.bottom);}if(/auto|scroll|hidden|clip/.test(s.overflowX)){left=Math.max(left,p.left);right=Math.min(right,p.right);}}
   return {x:left,y:top,width:Math.max(0,right-left),height:Math.max(0,bottom-top)};
  }),a=await action.boundingBox();
  return Boolean(g&&a&&(g.y+g.height<=a.y||g.y>=a.y+a.height||g.x+g.width<=a.x||g.x>=a.x+a.width));
 }).toBe(true);
 await action.click({trial:true,timeout:5000});
}

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
 await page.addStyleTag({content:'[class*="safeArea"] { padding: 59px 0 34px !important; } [data-training-hotkeys-suspended="true"] { max-height: min(var(--tour-slot-height, 100vh), calc(100vh - 117px)) !important; }'});
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

for(const readingSize of ['normal','largest','extra'])test(`mobile launch guidance leaves the highlighted action tappable (${readingSize})`,async({page})=>{
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
 await expect(tooltip).not.toContainText('Нажмите подсвеченную кнопку');
 await expect(tooltip).toContainText('Если карточек нет');
 if(readingSize==='normal')await expect.poll(()=>tooltip.evaluate(el=>el.scrollHeight<=el.clientHeight)).toBe(true);
 await tooltip.locator('p').last().scrollIntoViewIfNeeded();
 // A visible locator alone does not prove that an overlay lets the user tap it.
 await launch.click({trial:true,timeout:5000});
 await launch.click();
 await expect(tooltip).toContainText('5 / 10');
});

for(const device of [{width:393,height:852,size:'largest'},{width:320,height:568,size:'extra'}])test(`core walkthrough keeps every required control tappable ${device.width}`,async({page})=>{
 await page.setViewportSize(device);
 await setupAuthenticatedTrainingAttributionPage(page,0,{devTestLogin:false,visualProfile:'answer',settingsOverrides:{reading_size_phone:device.size,reading_size_desktop:device.size,preferences:{onboardingCompleted:false,onboardingLanguage:'ru'}}});
 const guide=page.locator('[data-training-hotkeys-suspended="true"]');
 await expect(guide).toBeVisible();
 await page.addStyleTag({content:'[class*="safeArea"] { padding: 59px 0 34px !important; }'});
 for(let index=0;index<10;index++){
  await expect(guide).toContainText(`${index+1} / 10`);
  const continueButton=guide.locator('button').last();
  if(index===0)await expectTourActionAccessible(guide,page.locator('[data-onboarding="interface"]'));
  if(index===1)for(const control of await page.locator('[data-onboarding="translation"] button').all())await expectTourActionAccessible(guide,control);
  if([0,1,4,6,9].includes(index)){
   await continueButton.scrollIntoViewIfNeeded();
   await continueButton.click();
  }else{
   const selectors:Record<number,string>={2:'[data-onboarding="nav-training"]:visible',3:'[data-onboarding="launch"]',5:'[data-onboarding="reveal"]',7:'[data-onboarding="learn"], [data-testid="training-review-grid"] button',8:'[data-onboarding="session-close"]'};
   const action=page.locator(selectors[index]).first();
   await expect(action).toBeVisible();
   await page.waitForTimeout(300);
   await expectTourActionAccessible(guide,action);
   await action.click();
  }
 }
 await expect(guide).toHaveCount(0);
});

for(const topic of ['languages','appearance','card'] as const)test(`live ${topic} tour required actions remain accessible`,async({page})=>{
 await page.setViewportSize({width:320,height:568});
 await setupAuthenticatedTrainingAttributionPage(page,0,{devTestLogin:false,visualProfile:'answer',settingsOverrides:{reading_size_phone:'extra',reading_size_desktop:'extra',preferences:{onboardingCompleted:true,onboardingLanguage:'ru'}}});
 await page.locator('[data-tour="settings-button"]').click();
 await page.getByRole('button',{name:tourCopy.ru.tourName,exact:true}).click();
 const labels={languages:'languagesTopic',appearance:'appearanceTopic',card:'cardTopic'} as const;
 await page.getByRole('button',{name:tourCopy.ru[labels[topic]],exact:true}).click();
 const guide=page.locator('[data-training-hotkeys-suspended="true"]');
 await expect(guide).toBeVisible();
 await page.addStyleTag({content:'nextjs-portal { display:none !important; } [class*="safeArea"] { padding: 59px 0 34px !important; }'});
 for(let index=0;index<tourFlows[topic].length;index++){
  const step=tourFlows[topic][index];
  const currentGuide=step.id==='report-close'?page.getByRole('note',{name:tourCopy.ru.tourName}):guide;
  if(step.bypass&&await page.locator(step.bypass).filter({visible:true}).count())continue;
  await expect(currentGuide).toContainText(`${index+1} / ${tourFlows[topic].length}`);
  if(step.next==='continue'){
   const button=currentGuide.locator('button').last();
   await button.scrollIntoViewIfNeeded();await button.click();
  }else{
   const target=page.locator(step.target).filter({visible:true}).first();
   const action=await target.evaluate(el=>el.matches('button,input,a')?'self':'child')==='self'?target:target.locator('button,input,a').filter({visible:true}).first();
   await page.waitForTimeout(300);
   await expectTourActionAccessible(currentGuide,action);await action.click();
  }
 }
});

test('leaving a running collections tour for settings pauses it and resume returns to the target',async({page})=>{
 await page.setViewportSize({width:1024,height:768});
 await setupAuthenticatedTrainingAttributionPage(page,0,{devTestLogin:false,visualProfile:'answer',settingsOverrides:{preferences:{onboardingCompleted:true,onboardingLanguage:'en'}}});
 await page.locator('[data-tour="settings-button"]').click();
 await page.getByRole('button',{name:tourCopy.en.tourName,exact:true}).first().click();
 await page.getByRole('button',{name:tourCopy.en.collectionsTopic,exact:true}).click();
 const guide=page.locator('[data-training-hotkeys-suspended="true"]');
 await expect(guide).toContainText('1 / 16');
 await page.goBack();
 await expect(page.getByRole('button',{name:tourCopy.en.resume,exact:true})).toBeVisible();
 await expect(guide).toHaveCount(0);
 await page.getByRole('button',{name:tourCopy.en.resume,exact:true}).click();
 await expect(guide).toContainText('1 / 16');
 await expect(page.locator('[data-onboarding="nav-library"]:visible').first()).toBeVisible();
});
