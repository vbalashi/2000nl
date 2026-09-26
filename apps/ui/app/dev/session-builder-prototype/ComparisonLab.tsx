"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {ArrowLeft, ArrowRight, ExternalLink, LayoutGrid, Maximize2, Monitor, RotateCcw, Smartphone} from "lucide-react";
import {useRouter} from "next/navigation";
import {BuilderSnapshot, comparisonChannel, initialSnapshot, Variant, variants} from "./variants";
import c from "./comparison.module.css";

const basePath="/dev/session-builder-prototype";

function LiveFrame({variant, mobile, focused, register}:{variant:Variant;mobile:boolean;focused:boolean;register:(variant:Variant,frame:HTMLIFrameElement|null)=>void}) {
  const container=useRef<HTMLDivElement>(null);
  const [width,setWidth]=useState(520);
  useEffect(()=>{
    const observer=new ResizeObserver(([entry])=>{if(entry.contentRect.width>0)setWidth(entry.contentRect.width);});
    observer.observe(container.current!);
    return ()=>observer.disconnect();
  },[]);
  const naturalWidth=mobile?390:focused?Math.max(width,320):1060;
  const scale=Math.min(1,width/naturalWidth);
  const stageHeight=focused?Math.max(640,typeof window!=="undefined"?window.innerHeight-200:760):mobile?550:440;
  return <div ref={container} className={c.frameArea} style={{height:stageHeight}}>
    <div className={c.frameStage} style={{width:naturalWidth*scale,height:stageHeight}}>
      <iframe ref={frame=>register(variant,frame)} title={`${variants.find(v=>v.id===variant)!.name} live prototype`} src={`${basePath}?variant=${variant}&embed=1`} style={{width:naturalWidth,height:stageHeight/scale,transform:`scale(${scale})`}}/>
    </div>
  </div>;
}

export function ComparisonLab({initialMobile=false}:{initialMobile?:boolean}) {
  const [mobile,setMobile]=useState(initialMobile);
  const [layout,setLayout]=useState<"row"|"grid">(initialMobile?"row":"grid");
  const [focus,setFocus]=useState<Variant|null>(null);
  const [linked,setLinked]=useState(true);
  const [snapshot,setSnapshot]=useState<BuilderSnapshot>(initialSnapshot);
  const [ready,setReady]=useState<string[]>([]);
  const frames=useRef<Partial<Record<Variant,HTMLIFrameElement>>>({});
  const latest=useRef(snapshot);
  const linkedRef=useRef(linked);
  const register=useCallback((variant:Variant,frame:HTMLIFrameElement|null)=>{if(frame)frames.current[variant]=frame;},[]);
  const broadcast=useCallback((value:BuilderSnapshot,except?:Variant,section?:string)=>{
    for(const [variant,frame] of Object.entries(frames.current)) if(variant!==except)frame?.contentWindow?.postMessage({channel:comparisonChannel,type:"apply",snapshot:value,section},window.location.origin);
  },[]);
  useEffect(()=>{linkedRef.current=linked;},[linked]);
  useEffect(()=>{
    const receive=(event:MessageEvent)=>{
      if(event.origin!==window.location.origin || event.data?.channel!==comparisonChannel)return;
      const entry=Object.entries(frames.current).find(([,frame])=>frame?.contentWindow===event.source);
      if(!entry)return;
      const variant=entry[0] as Variant;
      if(event.data.type==="ready"){
        setReady(r=>r.includes(variant)?r:[...r,variant]);
        event.source?.postMessage({channel:comparisonChannel,type:"apply",snapshot:latest.current},{targetOrigin:window.location.origin});
      }
      if(event.data.type==="state" && event.data.snapshot){
        latest.current=event.data.snapshot;
        setSnapshot(event.data.snapshot);
        if(linkedRef.current)broadcast(event.data.snapshot,variant);
      }
    };
    window.addEventListener("message",receive);
    return ()=>window.removeEventListener("message",receive);
  },[broadcast]);
  const apply=(value:BuilderSnapshot,section?:string)=>{latest.current=value;setSnapshot(value);broadcast(value,undefined,section);};
  const scenario=(name:string)=>{
    if(name==="Overview")apply({...latest.current,open:[],nounOpen:false},"overview");
    if(name==="Exercises")apply({...latest.current,open:["exercises"],nounOpen:false},"exercises");
    if(name==="Noun filters")apply({...latest.current,draft:{...latest.current.draft,language:"Dutch",source:"core",parts:["Nouns","Verbs"],article:"de"},open:["filters"],nounOpen:true},"filters");
    if(name==="Session")apply({...latest.current,open:["session"],nounOpen:false},"session");
  };
  return <div className={c.lab}>
    <header className={c.labHeader}>
      <div><span className={c.kicker}>2000NL · DESIGN LAB</span><h1>One session. Four ways to feel it.</h1><p>Same content and rules. Four visual directions. Everything below is interactive.</p></div>
      <a className={c.plainLink} href={basePath}>Original prototype <ExternalLink size={14}/></a>
    </header>
    <div className={c.toolbar}>
      <div className={c.deviceSwitch}><button aria-pressed={!mobile} onClick={()=>setMobile(false)}><Monitor size={16}/>Desktop</button><button aria-pressed={mobile} onClick={()=>setMobile(true)}><Smartphone size={16}/>Mobile</button></div>
      <div className={c.layoutSwitch}><button aria-pressed={layout==="row"} onClick={()=>setLayout("row")}>4 across</button><button aria-pressed={layout==="grid"} onClick={()=>setLayout("grid")}>2 × 2</button></div>
      <label className={c.sync}><input type="checkbox" checked={linked} onChange={e=>{setLinked(e.target.checked);linkedRef.current=e.target.checked;if(e.target.checked)broadcast(latest.current);}}/>Sync choices</label>
      <div className={c.scenarios}>{["Overview","Exercises","Noun filters","Session"].map(name=><button key={name} disabled={ready.length<4} onClick={()=>scenario(name)}>{name}</button>)}</div>
      <button className={c.reset} disabled={ready.length<4} onClick={()=>apply(initialSnapshot,"overview")}><RotateCcw size={14}/>Reset</button>
    </div>
    <div className={c.status}><span>{snapshot.draft.language} · {snapshot.draft.types.join(" + ")} · {snapshot.draft.directions.join(" + ")} · {snapshot.draft.size} exercises</span><span>{ready.length}/4 ready · fixture data</span></div>
    {focus && <div className={c.focusNav}><button onClick={()=>setFocus(null)}><LayoutGrid size={16}/>All four</button><div>{variants.map(v=><button key={v.id} aria-pressed={v.id===focus} onClick={()=>setFocus(v.id)}>{v.letter} · {v.name}</button>)}</div></div>}
    <div className={`${c.grid} ${layout==="row"?c.fourAcross:""} ${focus?c.focusGrid:""}`}>
      {variants.map(v=><section key={v.id} className={c.comparisonCard} style={focus && focus!==v.id?{display:"none"}:undefined}>
        <div className={c.cardHeading}><div className={`${c.variantLetter} ${c[v.id]}`}>{v.letter}</div><div><h2>{v.name}</h2><p>{v.caption}</p></div><button onClick={()=>setFocus(focus===v.id?null:v.id)} aria-label={focus===v.id?"Show all four designs":`Expand ${v.name}`}><Maximize2 size={16}/></button><a href={`${basePath}?variant=${v.id}`} target="_blank" rel="noreferrer" aria-label={`Open ${v.name} separately`}><ExternalLink size={15}/></a></div>
        <LiveFrame variant={v.id} mobile={mobile} focused={focus===v.id} register={register}/>
        <div className={c.cardFoot}><span>{v.detail}</span>{v.reference && <a href={v.reference} target="_blank" rel="noreferrer">Reference ↗</a>}</div>
      </section>)}
    </div>
    <p className={c.disclaimer}>Previews are scaled; expand a design to judge actual size. B and D are interpretations, not official product themes. C uses real Radix Themes components. No account changes or real training sessions.</p>
    <details className={c.state}><summary>Shared comparison state</summary><pre>{JSON.stringify(snapshot,null,2)}</pre></details>
  </div>;
}

export function VariantSwitcher({variant}:{variant:Variant}) {
  const router=useRouter();
  const index=variants.findIndex(v=>v.id===variant);
  const go=useCallback((delta:number)=>router.replace(`${basePath}?variant=${variants[(index+delta+4)%4].id}`,{scroll:false}),[index,router]);
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      const target=event.target as HTMLElement;
      if(target.closest('input,textarea,select,button,[contenteditable="true"],[role="slider"],[role="dialog"],dialog'))return;
      if(event.key==="ArrowLeft" || event.key==="ArrowRight"){event.preventDefault();go(event.key==="ArrowLeft"?-1:1);}
    };
    window.addEventListener("keydown",key);
    return ()=>window.removeEventListener("keydown",key);
  },[go]);
  return <nav className={c.switcher} aria-label="Prototype design variant"><button aria-label="Previous design" onClick={()=>go(-1)}><ArrowLeft size={16}/></button><span>{variants[index].letter} · {variants[index].name}</span><button aria-label="Next design" onClick={()=>go(1)}><ArrowRight size={16}/></button><a href={`${basePath}?view=compare`}><LayoutGrid size={16}/>Compare all</a></nav>;
}
