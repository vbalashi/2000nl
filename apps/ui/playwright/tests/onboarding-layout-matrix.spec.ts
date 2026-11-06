import {expect,test} from '@playwright/test';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {tourCopy,tourFlows} from '../../lib/onboarding/model';
import {actionTooltipBounds,tooltipBounds} from '../../components/onboarding/tooltipBounds';

// Geometry fixtures deliberately do not claim to exercise the screens behind a tour.
// They use all 58 non-final steps' real localized copy and the real tooltip CSS,
// checking top/centre/bottom positions with 44px controls and 120/260px groups.
// All controls in a group are protected by asserting no overlap with its full bounds.
for(const language of ['en','ru','nl','uk'] as const)for(const device of [
 {width:320,height:568,scale:1.5},{width:393,height:852,scale:1.3},
])test(`all live step copy clears controls: ${language} ${device.width}`,async({page})=>{
 await page.setViewportSize(device);
 const css=readFileSync(path.join(process.cwd(),'components/onboarding/onboarding.module.css'),'utf8');
 const steps=Object.entries(tourFlows).flatMap(([topic,flow])=>flow.filter(step=>step.id!=='done').map(step=>({topic,id:step.id,title:tourCopy[language][step.title],body:tourCopy[language][step.body],next:step.next,extra:step.id==='interface'?tourCopy[language].pauseIntro:step.id==='translation'?tourCopy[language].secondaryMention:''})));
 await page.setContent(`<style>${css}
 :root { --practice-surface-subtle:white;--practice-text:black;--practice-font-ui:Arial;--practice-text-body:${14*device.scale}px;--practice-text-title-sm:${20*device.scale}px;--practice-text-small:${13*device.scale}px;--practice-text-caption:${12*device.scale}px;--practice-accent:purple; }
 .tooltip{position:fixed} #action{position:fixed;left:24px;width:${device.width-48}px;height:44px} </style>
 <button id="action">Action</button><div class="tooltip"><div class="top"><span></span><button></button></div><h2></h2><p class="body"></p><p class="extra"></p><p class="instruction"></p><button class="primary continue"></button></div>`);
 await page.addScriptTag({content:`${tooltipBounds.toString()};${actionTooltipBounds.toString()};window.placeAction=actionTooltipBounds;`});
 const failures=await page.evaluate(({steps,device,copy})=>{
  const guide=document.querySelector<HTMLElement>('.tooltip')!,action=document.querySelector<HTMLButtonElement>('#action')!;
  guide.querySelector('.top span')!.textContent=copy.tourName+' · 10 / 16';guide.querySelector('.top button')!.textContent=copy.pause;
  const failures:string[]=[];
  for(const step of steps)for(const targetHeight of [44,120,260])for(const y of [71,Math.round((device.height-targetHeight)/2),device.height-46-targetHeight]){
   guide.querySelector('h2')!.textContent=step.title;guide.querySelector('.body')!.textContent=step.body;guide.querySelector<HTMLElement>('.extra')!.textContent=step.extra;guide.querySelector<HTMLElement>('.extra')!.hidden=!step.extra;
   const proceed=guide.querySelector<HTMLButtonElement>('.continue')!;proceed.textContent=copy.continue;proceed.hidden=step.next!=='continue';
   const hint=guide.querySelector<HTMLElement>('.instruction')!;hint.textContent=step.id==='launch'?'':copy.clickHint;hint.hidden=step.id==='launch'||step.next==='continue';
   guide.style.maxHeight='none';action.style.top=`${y+(targetHeight-44)/2}px`;
   const size=guide.getBoundingClientRect();
   const result=(window as unknown as {placeAction:typeof actionTooltipBounds}).placeAction({left:0,top:0,width:device.width,height:device.height},device,{top:59,right:0,bottom:34,left:0},size,{x:24,y:y+64},{top:y,bottom:y+targetHeight});
   guide.style.maxHeight=`${result.maxHeight}px`;guide.style.left=`${result.x}px`;guide.style.top=`${result.y}px`;
   const g=guide.getBoundingClientRect(),a=action.getBoundingClientRect();
   const hit=document.elementFromPoint(a.x+a.width/2,a.y+a.height/2);
   if(hit!==action||!(g.bottom<=y||g.top>=y+targetHeight)||g.top<70||g.bottom>device.height-45+1)failures.push(`${step.topic}/${step.id} h${targetHeight}@${y}: guide ${g.top}..${g.bottom}, action ${a.top}..${a.bottom}, hit ${hit?.tagName}`);
  }
  return failures;
 },{steps,device,copy:tourCopy[language]});
 expect(failures).toEqual([]);
});
