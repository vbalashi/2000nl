"use client";
// Throwaway interactive feedback comparison; no persisted learning actions.
import React from "react";
import {getUiMessages} from "@/lib/uiMessages";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import { DirectionCard } from "@/components/practice/builder/DirectionCard";
import builder from "@/components/training/pilot/approvedTrainingBuilder.module.css";
import { LogOut } from "lucide-react";
import {useRouter,useSearchParams} from "next/navigation";
import {TrainingSenseCardStage} from "@/components/training/v2/TrainingSenseCardStage";
import {buildTrainingSenseCardModel} from "@/components/training/v2/trainingSenseCardModel";
import {gateFurnitureEntry,gateFinanceEntry,gateBankGroup} from "@/lib/platform/fixtures/senseCardV1GateFixture";
import {TrainingInteractionPreferencesProvider,defaultTrainingInteractions} from "@/components/practice/ui/TrainingInteractionPreferences";
import approved from "@/components/training/approvedTrainingCard.module.css";
import theme from "@/components/practice/ui/practiceTheme.module.css";
import css from "./ExclusionFeedbackPrototype.module.css";
const repository={load:async()=>defaultTrainingInteractions,save:async()=>{}};
const examples=[
{word:"bank",definition:"een zitmeubel voor meerdere mensen"},
{word:"verantwoordelijkheid",definition:"de plicht om ervoor te zorgen dat iets goed gebeurt en om uit te leggen waarom je bepaalde keuzes hebt gemaakt"},
{word:"arbeidsongeschiktheidsverzekering",definition:"een verzekering die een deel van je inkomen vervangt wanneer je door ziekte of een ongeval niet meer kunt werken"},
{word:"af",definition:"helemaal klaar, zodat er niets meer aan gedaan hoeft te worden en het resultaat gebruikt of getoond kan worden"}
];
const names=["Уведомление","Строка над карточкой","Мягкое исчезновение","Уход в сторону","Промежуточное подтверждение"];
export function ExclusionFeedbackPrototype(){
const router=useRouter(),params=useSearchParams(),v=Math.max(0,Math.min(4,Number(params.get("variant"))||0));
const [index,setIndex]=React.useState(0),[side,setSide]=React.useState<"face"|"answer">("answer"),[accepted,setAccepted]=React.useState(false),[last,setLast]=React.useState<{index:number;entryId:string;exclusionId:string}|null>(null),[notice,setNotice]=React.useState(false),[dark,setDark]=React.useState(true);
const [language,setLanguage]=React.useState<OnboardingLanguage>("ru");
const copy=getUiMessages(language).trainingSession.knownChoice;
const [layout,setLayout]=React.useState("cards"),[example,setExample]=React.useState(0);
const [excludedDirections,setExcludedDirections]=React.useState({direct:false,reverse:false});
const [scope,setScope]=React.useState<"direct"|"reverse"|"both">("direct");
const timer=React.useRef<ReturnType<typeof setTimeout>>(),hide=React.useRef<ReturnType<typeof setTimeout>>();
function clear(){clearTimeout(timer.current);clearTimeout(hide.current);}
function reset(){clear();setIndex(0);setSide("answer");setAccepted(false);setLast(null);setNotice(false);setSavedKnown({});}
function change(n:number){reset();const q=new URLSearchParams(params.toString());q.set("variant",String((n+5)%5));router.replace(`?${q}`,{scroll:false});}
React.useEffect(()=>()=>clear(),[]);
React.useEffect(()=>{const f=(e:KeyboardEvent)=>{if((e.target as HTMLElement).closest("input,textarea,[contenteditable=true]"))return;if(e.key==="ArrowRight"||e.key==="ArrowLeft"){e.preventDefault();change(v+(e.key==="ArrowRight"?1:-1));}};window.addEventListener("keydown",f);return()=>window.removeEventListener("keydown",f);});
const entry=index%2?gateFinanceEntry:gateFurnitureEntry,base=buildTrainingSenseCardModel({group:gateBankGroup,entry,interfaceLanguage:language});
const sample=examples[(example+index)%examples.length];
const model={...base,headword:sample.word,plainHeadword:sample.word,article:sample.word==="bank"?"de":undefined,entryTranslation:undefined,definitions:[{...base.definitions[0],text:sample.definition}],examples:[]};
const [savedKnown,setSavedKnown]=React.useState<Record<string,{direct:boolean;reverse:boolean}>>({});
function next(){if(accepted)setSavedKnown(current=>({...current,[sample.word]:excludedDirections}));setIndex(i=>i+1);setSide("face");setAccepted(false);}
function exclude(){if(accepted)return;clear();setLast({index,entryId:entry.entryId,exclusionId:crypto.randomUUID()});setNotice(true);setExcludedDirections({...savedKnown[sample.word],direct:scope!=="reverse"||Boolean(savedKnown[sample.word]?.direct),reverse:scope!=="direct"||Boolean(savedKnown[sample.word]?.reverse)});setAccepted(true);if(v!==4)timer.current=setTimeout(next,v>=2?450:160);if(v<2)hide.current=setTimeout(()=>setNotice(false),5000);}
function undo(){if(!last)return;clear();setIndex(last.index);setSide("answer");setAccepted(false);setLast(null);setNotice(false);}
const message=last?`Исключено: bank — ${last.index%2?"банк":"скамейка"}`:"";
return <TrainingInteractionPreferencesProvider userId="prototype" initial={defaultTrainingInteractions} repository={repository}><main className={`${theme.theme} ${css.root}`} data-colour-mode={dark?"dark":"light"} data-practice-palette={dark?"graphite":"lavender"}>
<header className={css.header}><span>Тренировка · {index+1}/12</span><button onClick={()=>setDark(!dark)}>{dark?"Светлая тема":"Тёмная тема"}</button><button onClick={reset}>Заново</button></header>
<section className={css.workspace}>
{v===1&&<div className={css.inline} role="status">{notice&&last?<><span>✓ {message}</span><button onClick={undo}>Отменить</button></>:<span/>}</div>}
{v>=2&&v!==4&&<div className={css.inline}>{last?<><span>Последнее действие: отметка знания</span><button onClick={undo}>↶ Отменить</button></>:<span/>}</div>}
<div key={index} className={`${css.card} ${accepted?css[`effect${v}`]:""}`}><TrainingSenseCardStage model={model} mode={scope==="reverse"?"definition-to-word":"word-to-definition"} interfaceLanguage={language} contentLanguage="nl" translationLanguage="ru" side={side} onSideChange={setSide} busy={accepted} onAction={next} exclusionAction={<button disabled={accepted} onClick={exclude}>{accepted?"Выбор направлений":copy.markKnown}</button>}/></div>
{v===4&&accepted&&<div className={css.confirm}><div className={css.confirmBody} role="status"><LogOut size={40} strokeWidth={1.4} className={css.confirmIcon} aria-hidden="true"/>{layout!=="cards"&&<><h1>Исключено из тренировки</h1><p>{scope==="both"?"Оба направления":scope==="reverse"?"Слово по определению":"Определение по слову"}</p></>}{layout==="cards"?<div className={css.directionCards}>{(["direct","reverse"] as const).map(direction=>{const excluded=excludedDirections[direction];return <div key={direction} className={`${css.directionWrap} ${excluded?css.excluded:css.retained}`}><DirectionCard label={direction==="direct"?copy.direct:copy.reverse} selected={false} prompt={direction==="direct"?model.headword:sample.definition} answer={direction==="direct"?sample.definition:model.headword} promptLanguage="nl" answerLanguage="nl" classes={{card:builder.direction,heading:builder.directionHeading,check:builder.directionCheck,prompt:builder.prompt,arrow:builder.directionArrow,answer:builder.answer}}/><div className={css.directionStatus}><span className={css.stateLabel} role="status">{excluded?copy.known:copy.learning}</span><button className={css.directionAction} onClick={()=>setExcludedDirections(current=>({...current,[direction]:!current[direction]}))}>{excluded?copy.returnToLearning:copy.markKnown}</button></div></div>})}</div>:<div className={`${css.pair} ${layout==="vertical"?css.vertical:css.horizontal}`}><span className={css.pairWord}>{model.headword}</span><span className={css.arrow} aria-label={scope==="both"?"В обе стороны":scope==="reverse"?"От определения к слову":"От слова к определению"}>{scope==="both"?(layout==="vertical"?"↕":"↔"):scope==="reverse"?(layout==="vertical"?"↑":"←"):(layout==="vertical"?"↓":"→")}</span><span className={css.pairDefinition}>{sample.definition}</span></div>}<button className={css.undo} onClick={undo}>{copy.back}</button></div><button className={`${approved.primary} ${css.continueButton}`} onClick={next}>{copy.next}</button></div>}
{v===0&&notice&&last&&<div className={css.toast} role="status"><span>✓ {message}</span><button onClick={undo}>Отменить</button><button aria-label="Закрыть" onClick={()=>setNotice(false)}>×</button></div>}
</section><footer className={css.lab}><div className={css.switcher}><button aria-label="Предыдущий вариант" onClick={()=>change(v-1)}>←</button><strong>{v+1}/5 · {names[v]}</strong><button aria-label="Следующий вариант" onClick={()=>change(v+1)}>→</button></div><div className={css.tools}><select aria-label="Язык прототипа" value={language} onChange={e=>setLanguage(e.target.value)}><option value="ru">Русский</option><option value="en">English</option><option value="nl">Nederlands</option><option value="uk">Українська</option></select>{v===4&&<><select aria-label="Расположение подтверждения" value={layout} onChange={e=>setLayout(e.target.value)}><option value="horizontal">Пара слева–справа</option><option value="vertical">Пара сверху–вниз</option><option value="cards">Две карточки упражнений</option></select><select aria-label="Пример" value={example} onChange={e=>{setExample(Number(e.target.value));setIndex(0);}}>{examples.map((e,i)=><option key={e.word} value={i}>{e.word}</option>)}</select></>}{v===4&&<select aria-label="Тип исключения в прототипе" value={scope} onChange={e=>{const value=e.target.value as typeof scope;setScope(value);if(accepted)setExcludedDirections({direct:value!=="reverse",reverse:value!=="direct"});}}><option value="direct">Слово → определение</option><option value="reverse">Определение → слово</option><option value="both">Оба направления</option></select>}<button onClick={exclude} disabled={accepted}>Открыть выбор</button><button onClick={next} disabled={accepted}>Следующая карточка</button><button onClick={()=>setSide(side==="face"?"answer":"face")}>Перевернуть</button></div><small>«Далее» — сохранить выбор · «Вернуться назад» — отменить изменения<br/>Прототип · демонстрационные значения · только в памяти · {accepted?"Выбор ещё не сохранён":"Готово"}{last?` · карточка ${last.index+1}`:""}</small></footer></main></TrainingInteractionPreferencesProvider>;
}
