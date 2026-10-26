import {expect,test} from '@playwright/test';
import {setupAuthenticatedTrainingAttributionPage} from '../support/trainingAttributionHarness';
import {getUiMessages} from '../../lib/uiMessages';

for (const refreshMode of ['focus','idle-poll'] as const) test(`open exclusion menu stays stable during ${refreshMode} authority checks`,async({page})=>{
 test.setTimeout(60_000);
 let authorityReads=0;
 page.on('response',response=>{if(response.url().includes('get_training_session_snapshot'))authorityReads++;});
 await page.setViewportSize({width:393,height:852});
 await page.emulateMedia({reducedMotion:'no-preference'});
 const fixture=await setupAuthenticatedTrainingAttributionPage(page,0,{visualProfile:'answer',useUuidEntryIds:true,useUuidSessionId:true,settingsOverrides:{preferences:{onboardingCompleted:true,onboardingLanguage:'en'}}});
 await page.getByRole('button',{name:/^Start training$/i}).click();
 const stage=page.getByTestId('training-sense-card-stage');
 await expect(stage).toBeVisible();
 if(refreshMode==='idle-poll') await stage.getByRole('button',{name:'Show answer',exact:true}).click();
 const opener=stage.getByRole('button',{name:getUiMessages('en').trainingSession.exclusion.headwordHelp});
 await opener.click();
 const menu=page.getByRole('menu');
 await expect(menu).toBeVisible();
 await expect(menu.getByRole('menuitem').first()).toBeFocused();
 await page.keyboard.press('End');
 const selected=menu.getByRole('menuitem').last();
 await expect(selected).toBeFocused();
 await menu.evaluate(async node=>{await Promise.all(node.getAnimations().map(a=>a.finished));});
 await page.evaluate(()=>{
  const menu=document.querySelector('[role="menu"]')!;
  const events:string[]=[];
  menu.addEventListener('animationstart',()=>events.push('entry-animation'));
  menu.addEventListener('toggle',event=>events.push(`popover-${(event as Event & {newState:string}).newState}`));
  const observer=new MutationObserver(()=>{if(!menu.isConnected)events.push('menu-detached');});
  observer.observe(document.body,{childList:true,subtree:true});
  Object.assign(window,{menuContinuity:{menu,events,observer}});
 });
 await page.route('**/rpc/get_training_session_snapshot',async route=>{
  await new Promise(resolve=>setTimeout(resolve,350));
  await route.fallback();
 });
 if(refreshMode==='focus'){
  for(let i=0;i<2;i++){
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
   const refresh=page.locator('[data-authority-refreshing]');
   await expect(refresh).toBeVisible();
   await expect(menu.getByRole('menuitem').first()).toBeDisabled();
   await expect(refresh).toHaveCount(0);
   await expect(menu.getByRole('menuitem').first()).toBeEnabled();
  }
 } else {
  const initialReads=authorityReads;
  // Real timers: do not alter the session lease or browser visibility behavior.
  await expect.poll(()=>authorityReads-initialReads,{timeout:50_000}).toBeGreaterThanOrEqual(2);
  await expect(page.locator('[data-authority-refreshing]')).toHaveCount(0);
 }
 await expect(selected).toBeFocused();

 const evidence=await page.evaluate(async()=>{
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const state=(window as unknown as {menuContinuity:{menu:Element;events:string[];observer:MutationObserver}}).menuContinuity;
  state.observer.disconnect();
  return {connected:state.menu.isConnected,events:state.events};
 });
 expect(evidence).toEqual({connected:true,events:[]});
 expect(fixture.requests.progressActions).toHaveLength(0);
 await page.keyboard.press('Escape');
 await expect(menu).toHaveCount(0);
 await expect(opener).toBeFocused();
 await expect(stage).toHaveAttribute('data-side',refreshMode==='idle-poll'?'answer':'face');
});
