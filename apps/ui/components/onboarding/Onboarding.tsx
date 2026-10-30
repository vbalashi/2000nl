'use client';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Joyride,type TooltipRenderProps} from 'react-joyride';
import {tourCopy,tourFlows,topics,tourStorageKey,parseTourRecord,pausePoint,type TourTopic,type TourRecord,type TourStep} from '@/lib/onboarding/model';
import {ONBOARDING_SIGNAL,ONBOARDING_PAUSE} from '@/lib/onboarding/signals';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {SettingsPanel} from '@/components/practice/settings/SettingsLayout';
import s from './onboarding.module.css';
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
 const start=useCallback((topic:TourTopic,remaining:TourTopic[]=[])=>{setRecord(prev=>({version:1,topic,step:0,status:'running',remaining,coreCompleted:prev?.coreCompleted??!autoStart}));portRef.current.prepare(topic,0);},[autoStart]);
 useEffect(()=>{if(ready&&!record&&autoStart&&!autoStarted.current){autoStarted.current=true;start('core');}},[ready,record,autoStart,start]);
 const pause=useCallback(()=>{window.dispatchEvent(new Event(ONBOARDING_PAUSE));setRecord(prev=>prev?{...prev,status:'paused',step:pausePoint(prev)}:prev);portRef.current.pause();},[]);
 const advance=useCallback(()=>{setRecord(prev=>{if(!prev||prev.status!=='running')return prev;const last=prev.step===tourFlows[prev.topic].length-1;const selected=prev.topic==='collections'&&tourFlows[prev.topic][prev.step].id==='membership'?document.querySelector<HTMLInputElement>('[data-onboarding=member-option]:checked')?.value:undefined;return {...prev,...(selected?{collectionId:selected}:{}),step:last?prev.step:prev.step+1,status:last?'complete':'running',coreCompleted:prev.coreCompleted||last&&prev.topic==='core'};});},[]);
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
 const labels={core:copy.tourName,collections:copy.collectionsTopic,card:copy.cardTopic,stats:copy.statsTopic,sharing:copy.sharingTopic,incoming:copy.incomingTopic,languages:copy.languagesTopic,appearance:copy.appearanceTopic};
 return <SettingsPanel title={copy.tourName}><p className={s.hint}>{copy.deviceHint}</p>{tour.saveError&&<p role="alert">{copy.storageError}</p>}
 <div className={s.actions}>{record&&record.status!=='complete'&&<button onClick={tour.resume}>{copy.resume}</button>}<button onClick={()=>tour.start('core')}>{copy.restart}</button></div>
 <h3>{copy.topicHeading}</h3><div className={s.topics}>{available.filter(topic=>topic!=='core').map(topic=><button key={topic} onClick={()=>tour.start(topic)}>{labels[topic]}</button>)}</div><div className={s.actions}><button onClick={()=>{const [first,...rest]=available.filter(topic=>topic!=='core');if(first)tour.start(first,rest);}}>{copy.allTopics}</button></div></SettingsPanel>;
}
function Tooltip({step,tooltipProps}:TooltipRenderProps){
 const tour=React.useContext(TourContext)!;const current=tourFlows[tour.record!.topic][tour.record!.step];
 const canContinue=current.next==='continue'&&Boolean(step.data?.ready);
 return <div {...tooltipProps} data-training-hotkeys-suspended="true" className={s.tooltip}><div className={s.top}><span>{tour.copy.tourName} · {tour.record!.step+1} / {tourFlows[tour.record!.topic].length}</span><button onClick={tour.pause}>{tour.copy.pause}</button></div><h2>{step.title}</h2><p>{step.content}</p>
 {current.id==='interface'&&<p>{tour.copy.pauseIntro}</p>}{current.id==='translation'&&<p>{tour.copy.secondaryMention}</p>}
 {current.next==='continue'?<button disabled={!canContinue} className={s.primary} onClick={tour.advance}>{current.id==='done'?tour.copy.done:tour.copy.continue}</button>:<p className={s.instruction}>{tour.copy.clickHint}</p>}
 {tour.saveError&&<p role="alert">{tour.copy.storageError}</p>}</div>;
}
export function useOnboardingQueryLocked(){const tour=React.useContext(TourContext);return tour?.record?.status==='running'&&['collections','stats'].includes(tour.record.topic);}
function TourOverlay(){
 const tour=React.useContext(TourContext)!;const {record,copy,advance,pause}=tour;
 const baseStep=record?tourFlows[record.topic][record.step]:null;
 const step=React.useMemo(()=>baseStep&&baseStep.id==='source-pick'&&record?.collectionId?{...baseStep,target:`[data-onboarding=source-option][data-source-value="user:${record.collectionId}"]`}:baseStep,[baseStep,record?.collectionId]);
 const [target,setTarget]=useState<HTMLElement|null>(null),[waiting,setWaiting]=useState(false),[canContinue,setCanContinue]=useState(false),[topLayer,setTopLayer]=useState<HTMLElement|null>(null);
 const running=record?.status==='running';
 useEffect(()=>{
  setTarget(null);setWaiting(false);if(!running||!step)return;
  let cancelled=false,frame=0,previous='',stable=0,armed=false;
  const click=(event:MouseEvent)=>{const el=visible(step.target);if(el&&event.target instanceof Node&&el.contains(event.target)&&step.next==='click'){
   if(step.ready){armed=true;}else advance();
  }};
  const signal=(event:Event)=>{if((event as CustomEvent).detail===step.next)advance();};
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
 if(!running||!step)return null;
 const text=(value:string)=>value.replace('{section}',document.querySelector('[data-onboarding="appearance"]')?.getAttribute('aria-label')??'');
 const dialog=target?.closest<HTMLElement>('dialog,[popover]')??undefined;
 if(topLayer&&!topLayer.contains(target))return null;
 return <>{target&&<Joyride key={`${record!.topic}:${record!.step}:${tour.language}`} run steps={[{target:()=>target,title:text(copy[step.title]),content:text(copy[step.body]),placement:step.id==='done'?'center':'auto',data:{ready:canContinue}}]} tooltipComponent={Tooltip} portalElement={dialog} onEvent={event=>{if(['finished','skipped'].includes(event.status))pause();}} options={{skipBeacon:true,hideOverlay:Boolean(dialog),blockTargetInteraction:false,disableFocusTrap:true,overlayClickAction:false,dismissKeyAction:'close',closeButtonAction:'skip',overlayColor:'rgba(24,19,34,.52)',spotlightPadding:8,spotlightRadius:15,width:340,zIndex:10000,skipScroll:true,primaryColor:'#71608d'}}/>}
 {!target&&waiting&&<aside className={s.recovery} role="status"><p>{copy.waiting}</p><button onClick={pause}>{copy.pause}</button><button onClick={()=>tour.start(record!.topic)}>{copy.retryTopic}</button></aside>}</>;
}
