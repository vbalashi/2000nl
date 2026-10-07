"use client";
import React, {Fragment} from "react";
import {useTrainingInteractions} from "@/components/practice/ui/TrainingInteractionPreferences";
const PRONUNCIATION_SEPARATOR = "·";
export function HeadwordWithPronunciationBreaks({text,plainText}: {text:string;plainText?:string}) {
 const {preferences,save,loadStatus} = useTrainingInteractions();
 const lastTouch = React.useRef(0);
 const touchStart = React.useRef<{x:number;y:number;time:number}|null>(null);
 const suppressDoubleClick = React.useRef(0);
 const hidden = !preferences.syllableDoubleTap || !preferences.showSyllables;
 const toggle = () => {if(loadStatus === "ready")void save({...preferences,showSyllables:!preferences.showSyllables});};
 const plain = plainText ?? text.replace(/[·ˈˌ]/g,"");
 const segments = text.split(PRONUNCIATION_SEPARATOR);
 if(segments.length===1) return <>{plain}</>;
 const content = hidden ? plain : segments.map((segment,index) =>
  <Fragment key={`${segment}-${index}`}><span className="whitespace-nowrap">{segment}{index<segments.length-1?PRONUNCIATION_SEPARATOR:null}</span>{index<segments.length-1?<wbr/>:null}</Fragment>);
 if(!preferences.syllableDoubleTap) return <>{content}</>;
 return <span role="button" tabIndex={0} aria-label={plain} aria-pressed={!hidden}
   data-headword-syllables={hidden?"hidden":"visible"} style={{touchAction:"manipulation"}}
   onDoubleClick={() => {if(Date.now()>suppressDoubleClick.current)toggle();}}
   onPointerDown={event => {if(event.pointerType==="touch"&&event.isPrimary)touchStart.current={x:event.clientX,y:event.clientY,time:Date.now()};}}
   onPointerCancel={()=>{touchStart.current=null;lastTouch.current=0;}}
   onPointerUp={event => {
    if(event.pointerType!=="touch" || !event.isPrimary)return;
    const now=Date.now(),start=touchStart.current;touchStart.current=null;
    if(!start||now-start.time>500||Math.abs(event.clientX-start.x)>10||Math.abs(event.clientY-start.y)>10){lastTouch.current=0;return;}
    if(lastTouch.current && now-lastTouch.current<350){toggle();lastTouch.current=0;suppressDoubleClick.current=now+500;}
    else lastTouch.current=now;
   }}
   onKeyDown={event => {if(event.key==="Enter"||event.key===" "){event.preventDefault();event.stopPropagation();toggle();}}}
 >{content}</span>;
}
