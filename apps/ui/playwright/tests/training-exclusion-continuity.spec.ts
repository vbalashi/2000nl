import {expect,test} from '@playwright/test';
import {setupAuthenticatedTrainingAttributionPage} from '../support/trainingAttributionHarness';
import {getUiMessages} from '../../lib/uiMessages';

for (const refreshMode of ['focus','idle-poll'] as const) test(`Known draft stays stable during ${refreshMode} authority checks`,async({page})=>{
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
 const copy=getUiMessages('en').trainingSession.knownChoice;
 const opener=stage.getByRole('button',{name:copy.markKnown,exact:true});
 await opener.click();
 const choice=page.getByRole('region',{name:copy.choiceLabel,exact:true});
 await expect(choice.getByRole('button',{name:copy.next,exact:true})).toBeEnabled();
 await choice.getByRole('button',{name:copy.markKnown,exact:true}).click();
 await expect(choice.getByText(copy.known,{exact:true})).toHaveCount(2);
 const selected=choice.getByRole('button',{name:copy.returnToLearning,exact:true}).last();
 await selected.focus();
 await choice.evaluate(choice=>{
  const events:string[]=[];
  const observer=new MutationObserver(()=>{if(!choice.isConnected)events.push('editor-detached');});
  observer.observe(document.body,{childList:true,subtree:true});
  Object.assign(window,{knownContinuity:{choice,events,observer}});
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
   await expect(choice.getByRole('button',{name:copy.next,exact:true})).toBeDisabled();
   await expect(refresh).toHaveCount(0);
   await expect(choice.getByRole('button',{name:copy.next,exact:true})).toBeEnabled();
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
  const state=(window as unknown as {knownContinuity:{choice:Element;events:string[];observer:MutationObserver}}).knownContinuity;
  state.observer.disconnect();
  return {connected:state.choice.isConnected,events:state.events};
 });
 expect(evidence).toEqual({connected:true,events:[]});
 await expect(choice.getByText(copy.known,{exact:true})).toHaveCount(2);
 expect(fixture.requests.knownChoices).toHaveLength(0);
 expect(fixture.requests.progressActions).toHaveLength(0);
 await choice.getByRole('button',{name:copy.back,exact:true}).click();
 await expect(choice).toHaveCount(0);
 await expect(opener).toBeFocused();
 await expect(stage).toHaveAttribute('data-side',refreshMode==='idle-poll'?'answer':'face');
});
