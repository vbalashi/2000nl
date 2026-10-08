"use client";
import React,{useState} from "react";
import {BuilderPrototype} from "./BuilderPrototype";
import {TrainingCardShell,TrainingCardFace,TrainingCardAnswerHeader,TrainingCardAnswerBody,TrainingCardReviewButton,trainingReviewGridClassName,trainingStageClassName} from "@/components/training/v2/TrainingCardTemplates";
import type {TrainingCardAnswer} from "@/lib/training/exerciseCardPresentation";
import s from "./palette.module.css";
const palettes=[{id:"solid",name:"01 · Indigo",description:"Насыщенное выделение — ближайший родственник чёрных кнопок D."},{id:"soft",name:"02 · Lavender",description:"Лёгкая заливка и фиолетовый текст — спокойнее, но заметнее по площади."},{id:"notch",name:"03 · Side accent",description:"Белая кнопка и боковая засечка — минимум цветных пятен."}];
const model:TrainingCardAnswer={headword:"fiets",article:"de",partOfSpeech:"noun",repeatCount:4,entryTranslation:"bicycle",definitions:[{contentNodeId:"demo-definition",parentContentNodeId:null,kind:"definition",text:"Een voertuig met twee wielen waarop je trapt om vooruit te komen.",children:[]}],examples:[{contentNodeId:"demo-example",parentContentNodeId:null,kind:"example",text:"Ik ga elke dag met de fiets naar mijn werk.",children:[]}]};
export function PaletteLab({initialPalette}:{initialPalette:string}){
 const [palette,setPalette]=useState(palettes.some(p=>p.id===initialPalette)?initialPalette:"soft");
 const [screen,setScreen]=useState("builder");
 const [revealed,setRevealed]=useState(true);const [feedback,setFeedback]=useState("");
 const current=palettes.find(p=>p.id===palette)!;
 function select(id:string){setPalette(id);const url=new URL(location.href);url.searchParams.set("palette",id);history.replaceState(null,"",url);}
 return <div className={`${s.lab} font-sense-sans`} data-palette={palette}>
 <header className={s.toolbar}><div><strong>D × 2000NL</strong><p>{current.description}</p></div><nav aria-label="Palette variants">{palettes.map(p=><button key={p.id} aria-pressed={palette===p.id} onClick={()=>select(p.id)}>{p.name}</button>)}</nav><a href="?variant=emil">Original D ↗</a></header>
 <div className={`${s.workspace} ${screen==="library"?s.libraryWorkspace:""}`}><div className={s.builder}><BuilderPrototype variant="emil" onScreenChange={setScreen}/></div>
 {screen!=="library"&&<aside className={s.preview}><div className={s.previewHeading}><span>TRAINING CARD · REAL COMPONENTS</span><button onClick={()=>{setRevealed(!revealed);setFeedback("");}}>{revealed?"Show question":"Show answer"}</button></div>
 <div className={s.cardArea}><div className={trainingStageClassName()}>
 <div className={s.session}><span>Daily Dutch</span><span>4 / 20</span></div>
 <TrainingCardShell answerVisible={revealed}>{revealed?<><TrainingCardAnswerHeader model={model} translationVisible={false} translationAvailable={false} translationLabel="Translation" audioLabel="Audio unavailable in this preview" moreLabel="Details unavailable in this preview" busy={false} onToggleTranslation={()=>{}}/><TrainingCardAnswerBody model={model} translationVisible={false} interfaceLanguage="en" onReachEnd={()=>{}}/></>:<TrainingCardFace prompt={{kind:"expression",text:"fiets",article:"de"}} partOfSpeech="noun" hintVisible={false} hintLabel="Hint" contentLabel="Question"/>}</TrainingCardShell>
 {revealed?<div className={`${trainingReviewGridClassName} ${s.review}`}>{([['fail','Again'],['hard','Hard'],['success','Good'],['easy','Easy']] as const).map(([result,label])=><TrainingCardReviewButton key={result} result={result} label={label} busy={false} onClick={()=>setFeedback(label+" · preview only")}/>)}</div>:<button className={s.reveal} onClick={()=>setRevealed(true)}>Show answer</button>}
 </div></div><p role="status" className={s.feedback}>{feedback||"Цветные засечки оценки сохранены. В Lavender облегчены подписи и метки."}</p>
 <div className={s.notes}><strong>Что сравниваем</strong><p>Настройку слева можно раскрывать и менять. Карточка справа — реальные компоненты с демонстрационным содержимым; ответы не записываются.</p><p>Inter — интерфейс. Newsreader — содержимое карточки. Для выбора параметров используется только фиолетовый; четыре цвета оценки остаются за оценкой ответа.</p></div>
 </aside>}</div></div>;
}
