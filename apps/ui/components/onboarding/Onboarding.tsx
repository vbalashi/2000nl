'use client';
import { localizedField, localizedSection } from "@/lib/i18n/catalog";

import {Check} from 'lucide-react';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Joyride,type TooltipRenderProps} from 'react-joyride';
import {createPortal} from 'react-dom';
import {tourCopy,tourFlows,topics,tourStorageKey,parseTourRecord,pausePoint,type TourTopic,type TourRecord,type TourStep} from '@/lib/onboarding/model';
import {ONBOARDING_SIGNAL,ONBOARDING_PAUSE} from '@/lib/onboarding/signals';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {SettingsPanel} from '@/components/practice/settings/SettingsLayout';
import s from './onboarding.module.css';
import settings from '@/components/practice/settings/settings.module.css';
import {actionTooltipBounds,tooltipBounds} from './tooltipBounds';
export type TourPort={prepare:(topic:TourTopic,step:number)=>void;pause:()=>void;completeCore:()=>void;enter?:(topic:TourTopic,step:number)=>void};
const TourContext=React.createContext<ReturnType<typeof useTour>|null>(null);
function visible(selector:string):HTMLElement|null {
 try {return Array.from(document.querySelectorAll<HTMLElement>(selector)).find(el=>el.getClientRects().length>0&&!el.closest('[aria-hidden="true"],[inert]')&&getComputedStyle(el).visibility!=='hidden'&&!(el instanceof HTMLButtonElement&&el.disabled))??null;}catch{return null;}
}
export function isStepReady(step:TourStep){return Boolean(!step.ready||visible(step.ready));}
function useTour(userId:string,autoStart:boolean,language:OnboardingLanguage,port:TourPort){
 const [record,setRecord]=useState<TourRecord|null>(null),[ready,setReady]=useState(false),[saveError,setSaveError]=useState(false);
 const portRef=useRef(port);portRef.current=port;
 const loaded=useRef(false),autoStarted=useRef(false),wasCompleted=useRef(false);
 const copy=tourCopy[language];
 useEffect(()=>{if(loaded.current)return;loaded.current=true;let saved:TourRecord|null=null;try{saved=parseTourRecord(localStorage.getItem(tourStorageKey(userId)));}catch{setSaveError(true);}
 // Re-open a stable topic entry after reload; live dialogs and unsaved forms are not fabricated.
 if(saved){wasCompleted.current=saved.status==='complete';setRecord(saved.status==='complete'?saved:{...saved,status:'paused',step:0});}setReady(true);
 },[userId]);
 useEffect(()=>{if(!ready||!record)return;try{localStorage.setItem(tourStorageKey(userId),JSON.stringify(record));setSaveError(false);}catch{setSaveError(true);}},[record,ready,userId]);
 const start=useCallback((topic:TourTopic,remaining:TourTopic[]=[])=>{setRecord(prev=>({version:1,topic,step:0,status:'running',remaining,coreCompleted:prev?.coreCompleted??!autoStart,completedTopics:prev?.completedTopics??(prev?.status==='complete'?[prev.topic]:[])}));portRef.current.prepare(topic,0);},[autoStart]);
 useEffect(()=>{if(ready&&!record&&autoStart&&!autoStarted.current){autoStarted.current=true;start('core');}},[ready,record,autoStart,start]);
 const pause=useCallback(()=>{window.dispatchEvent(new Event(ONBOARDING_PAUSE));setRecord(prev=>prev?{...prev,status:'paused',step:pausePoint(prev)}:prev);portRef.current.pause();},[]);
 const advance=useCallback(()=>{setRecord(prev=>{if(!prev||prev.status!=='running')return prev;const last=prev.step===tourFlows[prev.topic].length-1;const selected=prev.topic==='collections'&&tourFlows[prev.topic][prev.step].id==='membership'?document.querySelector<HTMLInputElement>('[data-onboarding=member-option]:checked')?.value:undefined;return {...prev,...(selected?{collectionId:selected}:{}),step:last?prev.step:prev.step+1,status:last?'complete':'running',coreCompleted:prev.coreCompleted||last&&prev.topic==='core',completedTopics:last?Array.from(new Set([...(prev.completedTopics??[]),prev.topic])):prev.completedTopics};});},[]);
 useEffect(()=>{if(record?.status==='running')portRef.current.enter?.(record.topic,record.step);},[record]);
 useEffect(()=>{if(record?.status==='complete'&&!wasCompleted.current){wasCompleted.current=true;window.dispatchEvent(new Event(ONBOARDING_PAUSE));if(record.topic==='core')portRef.current.completeCore();if(record.remaining?.length){const [next,...rest]=record.remaining;start(next,rest);}else portRef.current.pause();}else if(record&&record.status!=='complete')wasCompleted.current=false;},[record,start]);
 const resume=()=>{if(!record)return;portRef.current.prepare(record.topic,record.step);setRecord({...record,status:'running'});};
 return {record,ready,saveError,start,pause,advance,resume,copy,language};
}
export function OnboardingProvider({userId,autoStart,language,port,children}:{userId:string;autoStart:boolean;language:OnboardingLanguage;port:TourPort;children:React.ReactNode}){
 const tour=useTour(userId,autoStart,language,port);return <TourContext.Provider value={tour}>{children}<TourOverlay/></TourContext.Provider>;
}
export function OnboardingSettings({sharing,collections}:{sharing:boolean;collections:boolean}){
 const tour=React.useContext(TourContext);if(!tour)return null;const {copy,record}=tour;
 const available=topics.filter(topic=>(collections||topic!=='collections')&&(sharing||!['sharing','incoming'].includes(topic))&&(collections||topic!=='sharing'));
 const statusCopy=localizedSection("onboardingTopicStatus")[tour.language];
 const completed=new Set([...(record?.completedTopics??[]),...(record?.status==='complete'?[record.topic]:[])]);
 const labels={core:copy.tourName,collections:copy.collectionsTopic,card:copy.cardTopic,stats:copy.statsTopic,sharing:copy.sharingTopic,incoming:copy.incomingTopic,languages:copy.languagesTopic,appearance:copy.appearanceTopic};
 return <SettingsPanel title={copy.tourName} className={s.settingsPanel}><p className={settings.hint}>{copy.deviceHint}</p>{tour.saveError&&<p role="alert">{copy.storageError}</p>}
 <div className={s.actions}>{record&&record.status!=='complete'&&<button onClick={tour.resume}>{copy.resume}</button>}<button onClick={()=>tour.start('core')}>{copy.restart}</button></div>
 <h3 className={settings.subheading}>{copy.topicHeading}</h3><div className={s.topics}>{available.filter(topic=>topic!=='core').map(topic=><button key={topic} onClick={()=>tour.start(topic)}><span>{labels[topic]}</span>{completed.has(topic)?<span className={s.topicStatus}><Check size={14} aria-hidden="true"/>{statusCopy.completed}</span>:record?.topic===topic&&record.status!=='complete'?<span className={s.topicStatus}>{statusCopy.inProgress}</span>:null}</button>)}</div><div className={s.actions}><button onClick={()=>{const [first,...rest]=available.filter(topic=>topic!=='core');if(first)tour.start(first,rest);}}>{copy.allTopics}</button></div></SettingsPanel>;
}
function Tooltip({step,tooltipProps}:TooltipRenderProps){
 const tour=React.useContext(TourContext)!;const current=tourFlows[tour.record!.topic][tour.record!.step];
 const canContinue=current.next==='continue'&&Boolean(step.data?.ready);
 return <div {...tooltipProps} data-training-hotkeys-suspended="true" className={s.tooltip}><span className={s.safeArea} aria-hidden="true"/><div className={s.top}><span>{tour.copy.tourName} · {tour.record!.step+1} / {tourFlows[tour.record!.topic].length}</span><button onClick={tour.pause}>{tour.copy.pause}</button></div><h2>{step.title}</h2><p>{step.content}</p>
 {current.id==='interface'&&<p>{tour.copy.pauseIntro}</p>}{current.id==='translation'&&<p>{tour.copy.secondaryMention}</p>}
 {current.next==='continue'?<button disabled={!canContinue} className={s.primary} onClick={tour.advance}>{current.id==='done'?tour.copy.done:tour.copy.continue}</button>:<p className={s.instruction}>{tour.copy.clickHint}</p>}
 {tour.saveError&&<p role="alert">{tour.copy.storageError}</p>}</div>;
}
export function useOnboardingQueryLocked(){const tour=React.useContext(TourContext);return tour?.record?.status==='running'&&['collections','stats'].includes(tour.record.topic);}
function TourOverlay(){
 const tour=React.useContext(TourContext)!;const {record,copy,advance,pause}=tour;
 const origin=useRef<HTMLSpanElement>(null);
 const baseStep=record?tourFlows[record.topic][record.step]:null;
 const step=React.useMemo(()=>baseStep&&baseStep.id==='source-pick'&&record?.collectionId?{...baseStep,target:`[data-onboarding=source-option][data-source-value="user:${record.collectionId}"]`}:baseStep,[baseStep,record?.collectionId]);
 const [target,setTarget]=useState<HTMLElement|null>(null),[waiting,setWaiting]=useState(false),[canContinue,setCanContinue]=useState(false),[topLayer,setTopLayer]=useState<HTMLElement|null>(null);
 const running=record?.status==='running';
 // Recompute when the visual viewport changes, including zoom and the keyboard.
 const [viewportVersion,setViewportVersion]=useState(0);
 useEffect(()=>{if(!running)return;const update=()=>setViewportVersion(v=>v+1);const viewport=window.visualViewport;
  window.addEventListener('resize',update);viewport?.addEventListener('resize',update);viewport?.addEventListener('scroll',update);
  return()=>{window.removeEventListener('resize',update);viewport?.removeEventListener('resize',update);viewport?.removeEventListener('scroll',update);};
 },[running]);
 const floatingOptions=React.useMemo(()=>{void viewportVersion;return {strategy:'fixed' as const, hideArrow:step?.id==='done', middleware:[{name:'safeViewport',async fn(state:import('@floating-ui/react-dom').MiddlewareState){
  const vv=window.visualViewport;const viewport={left:vv?.offsetLeft??0,top:vv?.offsetTop??0,width:vv?.width??window.innerWidth,height:vv?.height??window.innerHeight};
  const tooltip=state.elements.floating.firstElementChild as HTMLElement|null;
  if(tooltip){tooltip.style.setProperty('--tour-viewport-height',`${viewport.height}px`);tooltip.style.setProperty('--tour-viewport-width',`${viewport.width}px`);}
  const probe=state.elements.floating.querySelector('[aria-hidden="true"]') as HTMLElement|null;const style=probe?getComputedStyle(probe):null;
  const safe={top:parseFloat(style?.paddingTop||'0')||0,right:parseFloat(style?.paddingRight||'0')||0,bottom:parseFloat(style?.paddingBottom||'0')||0,left:parseFloat(style?.paddingLeft||'0')||0};
  const parent=await state.platform.getOffsetParent?.(state.elements.floating);
  const rect=await state.platform.convertOffsetParentRelativeRectToViewportRelativeRect!({elements:state.elements,rect:{...state.rects.floating,x:state.x,y:state.y},offsetParent:parent,strategy:state.strategy});
  const desired=step?.id==='done'?{x:viewport.left+(viewport.width-rect.width)/2,y:viewport.top+(viewport.height-rect.height)/2}:{x:rect.x,y:rect.y};
  const layout={width:document.documentElement.clientWidth,height:document.documentElement.clientHeight};
  const reference=state.elements.reference.getBoundingClientRect();
  const bounded=step?.next!=='continue'&&step?.id!=='done'
   ?actionTooltipBounds(viewport,layout,safe,rect,desired,reference)
   :{...tooltipBounds(viewport,layout,safe,rect,desired),maxHeight:Math.min(viewport.top+viewport.height,layout.height-safe.bottom)-Math.max(viewport.top,safe.top)-24};
  if(tooltip){
   const limit=`${bounded.maxHeight}px`;
   if(tooltip.style.getPropertyValue('--tour-slot-height')!==limit){tooltip.style.setProperty('--tour-slot-height',limit);return {reset:{rects:true}};}
  }
  return {x:state.x+bounded.x-rect.x,y:state.y+bounded.y-rect.y};
 }}]};},[step?.id,step?.next,viewportVersion]);
 useEffect(()=>{
  setTarget(null);setWaiting(false);if(!running||!step)return;
  let cancelled=false,frame=0,previous='',stable=0,armed=false;
  const click=(event:MouseEvent)=>{const el=visible(step.target);if(el&&event.target instanceof Node&&el.contains(event.target)&&step.next==='click'){
   if(step.ready){armed=true;}else advance();
  }};
  const signal=(event:Event)=>{if((event as CustomEvent).detail===step.next||step.id==='report-close'&&(event as CustomEvent).detail==='report-dismissed')advance();};
  document.addEventListener('click',click,true);window.addEventListener(ONBOARDING_SIGNAL,signal);
  const timeout=window.setTimeout(()=>{if(!cancelled)setWaiting(true);},12000);
  const sample=()=>{
   if(cancelled)return;
   if(step.bypass&&visible(step.bypass)){advance();return;}
   if(armed&&isStepReady(step)){advance();return;}
   setTopLayer(visible('dialog[open]')??visible('[popover]:popover-open'));
   setCanContinue(isStepReady(step));
   const el=visible(step.target);
   if(el){const r=el.getBoundingClientRect();const key=[r.x,r.y,r.width,r.height].map(Math.round).join(':');stable=previous===key?stable+1:0;previous=key;
    if(stable===3){el.scrollIntoView({block:'nearest',behavior:'instant'});setTarget(el);setWaiting(false);}
   }else{stable=0;previous='';setTarget(null);}
   frame=requestAnimationFrame(sample);
  };frame=requestAnimationFrame(sample);
  return()=>{cancelled=true;cancelAnimationFrame(frame);clearTimeout(timeout);document.removeEventListener('click',click,true);window.removeEventListener(ONBOARDING_SIGNAL,signal);};
 },[running,step,advance,tour.language]);
 useEffect(()=>{
  if(!running||!target)return;
  target.classList.add(s.target);
  return()=>target.classList.remove(s.target);
 },[running,target]);
 if(!running||!step)return <span ref={origin} hidden/>;
 const text=(value:string)=>value.replace('{section}',document.querySelector('[data-onboarding="appearance"]')?.getAttribute('aria-label')??'');
 const dialog=target?.closest<HTMLElement>('dialog,[popover]')??undefined;
 if(topLayer&&!topLayer.contains(target))return <span ref={origin} hidden/>;
 // Keep portal content under the account palette and text-scale owner. Body portals lose these inherited roles.
 const reportSlot=step.id==='report-close'?dialog?.querySelector<HTMLElement>('[data-onboarding=report-guide-slot]'):null;
 const themeHost=target?.closest<HTMLElement>('[data-account-palette]')??origin.current?.closest<HTMLElement>('[data-account-palette]')??undefined;
 return <><span ref={origin} hidden/>{target&&reportSlot&&createPortal(<div className={`${s.tooltip} ${s.inlineGuide}`} role="note" aria-label={copy.tourName}><div className={s.top}><span>{copy.tourName} · {record!.step+1} / {tourFlows[record!.topic].length}</span><button onClick={pause}>{copy.pause}</button></div><h2>{text(copy[step.title])}</h2><p>{text(copy[step.body])}</p><p className={s.instruction}>{copy.clickHint}</p></div>,reportSlot)}{target&&!reportSlot&&<Joyride key={`${record!.topic}:${record!.step}:${tour.language}`} run steps={[{target:()=>target,title:text(copy[step.title]),content:text(copy[step.body]),placement:dialog?'bottom':'auto',data:{ready:canContinue}}]} tooltipComponent={Tooltip} floatingOptions={floatingOptions} portalElement={dialog??themeHost} onEvent={event=>{if(['finished','skipped'].includes(event.status))pause();}} options={{arrowColor:'var(--practice-surface-subtle)',backgroundColor:'var(--practice-surface-subtle)',skipBeacon:true,hideOverlay:Boolean(dialog)||step.id==='input',blockTargetInteraction:false,disableFocusTrap:true,overlayClickAction:false,dismissKeyAction:'close',closeButtonAction:'skip',overlayColor:'var(--practice-backdrop)',spotlightPadding:8,spotlightRadius:15,width:340,zIndex:10000,skipScroll:true,primaryColor:'var(--practice-accent)'}}/>}
 {!target&&waiting&&<aside className={s.recovery} role="status"><p>{copy.waiting}</p><button onClick={pause}>{copy.pause}</button><button onClick={()=>tour.start(record!.topic)}>{copy.retryTopic}</button></aside>}</>;
}
