import { expect, test } from '@playwright/test';
import { setupAuthenticatedTrainingAttributionPage } from '../support/trainingAttributionHarness';
for (const active of [false,true]) test(`${active ? 'active' : 'idle'} retained Training does not flash Preparing training after Library return`, async ({page}, info) => {
  await page.setViewportSize({width:1440,height:900});
  await setupAuthenticatedTrainingAttributionPage(page,0,{visualProfile:'answer',bootstrapReadDelayMs:500,devTestLogin: process.env.TRAINING_CONTINUITY_DEV_LOGIN === "true"});
  const start=page.getByRole('button',{name:/Start training|Начать тренировку|Training starten/i});
  await expect(start).toBeVisible();
  if(active) { await start.click(); await expect(page.getByTestId('training-sense-card-v2')).toBeVisible(); }
  await page.evaluate(()=>{
    const trace: {at:number,text:string}[]=[]; (window as any).__returnTrace=trace;
    const sample=()=>{const text=document.body.innerText; if(/Preparing training|Training voorbereiden|Подготавливаем тренировку/i.test(text)) trace.push({at:performance.now(),text:JSON.stringify({body:text.slice(0,1200),gate:!!document.querySelector('[data-testid="training-startup-gate"]'),panels:[...document.querySelectorAll('[role="status"]')].map(n=>({text:n.textContent,context:n.getAttribute("data-context")}))})});};
    new MutationObserver(sample).observe(document.body,{subtree:true,childList:true,characterData:true});
  });
  for(let i=0;i<10;i++) {
    await page.getByRole('button',{name:/^Library$|^Библиотека$|^Bibliotheek$/}).first().click(); await page.waitForTimeout(350);
    await page.getByRole('button',{name:/^Training$|^Тренировка$/}).first().click();
    if(active) await expect(page.getByTestId('training-sense-card-v2')).toBeVisible(); else await expect(start).toBeVisible();
  }
  const trace=await page.evaluate(()=>(window as any).__returnTrace);
  await info.attach('return-dom-trace',{body:JSON.stringify(trace,null,2),contentType:'application/json'}); expect(trace).toEqual([]);
});
