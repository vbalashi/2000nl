"use client";

import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChartNoAxesColumn, ChevronDown, Library, LoaderCircle, Play, Settings, Sun, Moon, Monitor } from "lucide-react";
import {textSizeStyles} from "@/lib/reading/textScale";
import {usePreviewTextSize} from "./usePreviewTextSize";
import themeStyles from "@/components/practice/ui/practiceTheme.module.css";
import {usePracticeAppearance} from "@/components/practice/ui/usePracticeAppearance";
import {SavedTrainingControls} from "./SavedTrainingControls";
import {TrainingSessionPrototype} from "./TrainingSessionPrototype";
import {RecentActivity} from "./RecentActivity";
import {previewHistory,type PreviewRun} from "./sessionPreviewModel";
import {TrainingHome, sampleTrainings, type TrainingPreset} from "./TrainingHome";
import {BuilderDisclosureVariation} from "./BuilderDisclosureVariation";
import {BuilderScopePicker} from "./BuilderScopePicker";
import {TranslationDirectionPreview} from "./TranslationDirectionPreview";
import {SettingsPrototype} from "./SettingsPrototype";
import {StatisticsPrototype} from "./StatisticsPrototype";
import {LibraryPrototype} from "./LibraryPrototype";
import { AppDestinationNav,appDestinationLabel } from "@/components/navigation/AppDestinationNav";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import {getUiMessages} from "@/lib/uiMessages";
import { balances, Draft, Exercise, initialDraft, matchMeanings, parts, sources } from "./model";
import s from "./prototype.module.css";
import {Theme} from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import {Action, Choice, DesignContext, Directions, Modal, RangeControl} from "./VariantControls";
import {BuilderSnapshot, comparisonChannel, Variant} from "./variants";
import {VariantSwitcher} from "./ComparisonLab";

function Section({id, title, summary, open, onToggle, children}: {id: string; title: string; summary: React.ReactNode; open: boolean; onToggle: () => void; children: React.ReactNode}) {
  return <section className={s.section}>
    <button className={s.sectionHeading} onClick={onToggle} aria-expanded={open} aria-controls={`${id}-body`}>
      <span className={s.sectionTitle}>{title}</span><span className={s.summary} data-testid={`${id}-summary`}>{summary}</span>
      <span className={s.chevron}><ChevronDown size={16} className={open ? s.rotated : ""}/></span>
    </button>
    <div id={`${id}-body`} className={`${s.reveal} ${open ? s.open : ""}`} inert={!open} aria-hidden={!open}>
      <div><div className={s.sectionBody}>{children}</div></div>
    </div>
  </section>;
}
export function BuilderPrototype({variant="current",embedded=false,showSwitcher=false,initialScreen="builder",onScreenChange}:{variant?:Variant;embedded?:boolean;showSwitcher?:boolean;initialScreen?:"home"|"builder"|"library"|"statistics"|"settings";onScreenChange?:(screen:string)=>void}) {
  const [disclosure, setDisclosure] = useState<"flat" | "frame">("frame");
  useEffect(()=>{const value=new URLSearchParams(location.search).get("builderDisclosure");if(value==="flat"||value==="frame")setDisclosure(value);},[]);
  const changeDisclosure=(value:"flat"|"frame")=>{setDisclosure(value);const url=new URL(location.href);url.searchParams.set("builderDisclosure",value);history.replaceState(null,"",url);};
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [translationLanguage,setTranslationLanguage]=useState("English");
  const [interfaceLanguage,setInterfaceLanguage]=useState<OnboardingLanguage>("en");
  const wordDirections=useRef<Draft["directions"]>(["Direct"]);
  const textSize = usePreviewTextSize();
  const {palette,setPalette:changePalette,mode:colourMode,setMode:setColourMode,dark}=usePracticeAppearance("2000nl-preview-appearance-v1");
  const previousScreen=useRef<"builder"|"home"|"library"|"statistics">("home");
  const [statisticsTraining,setStatisticsTraining]=useState<string|null>(null);
  const [mainTraining,setMainTraining]=useState(0);
  const [editingTraining,setEditingTraining]=useState<number|null>(null);
  const [screen, setScreen] = useState<"builder" | "home" | "library" | "statistics" | "settings">(initialScreen);
  useEffect(()=>{onScreenChange?.(screen);},[screen,onScreenChange]);
  const [open, setOpen] = useState<string[]>([]);
  const [nounOpen, setNounOpen] = useState(false);
  const linkedReady=useRef(!embedded);
  const lastSnapshot=useRef("");
  useEffect(()=>{
    if(!embedded)return;
    let scrollTimer:ReturnType<typeof setTimeout>;
    const receive=(event:MessageEvent)=>{
      if(event.origin!==window.location.origin || event.source!==window.parent || event.data?.channel!==comparisonChannel || event.data.type!=="apply")return;
      const next=event.data.snapshot as BuilderSnapshot;
      lastSnapshot.current=JSON.stringify(next);
      linkedReady.current=true;
      setDraft(next.draft);setOpen(next.open);setNounOpen(next.nounOpen);setScreen("builder");
      if(event.data.section){
        clearTimeout(scrollTimer);
        const section=event.data.section as string;
        scrollTimer=setTimeout(()=>{
          const target=document.getElementById(`${section}-body`)?.parentElement;
          const top=section==="overview"?0:target?target.getBoundingClientRect().top+window.scrollY:0;
          window.scrollTo({top,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});
        },300);
      }
    };
    window.addEventListener("message",receive);
    window.parent.postMessage({channel:comparisonChannel,type:"ready"},window.location.origin);
    return ()=>{window.removeEventListener("message",receive);clearTimeout(scrollTimer);};
  },[embedded]);
  useEffect(()=>{
    const snapshot={draft,open,nounOpen};
    const encoded=JSON.stringify(snapshot);
    if(!embedded || !linkedReady.current || encoded===lastSnapshot.current)return;
    lastSnapshot.current=encoded;
    window.parent.postMessage({channel:comparisonChannel,type:"state",snapshot},window.location.origin);
  },[draft,open,nounOpen,embedded]);
  const [nounPresent, setNounPresent] = useState(false);
  useEffect(() => {
    if (nounOpen) { setNounPresent(true); return; }
    const timer = setTimeout(() => setNounPresent(false), 220);
    return () => clearTimeout(timer);
  }, [nounOpen]);
  const [saveDialog, setSaveDialog] = useState(false);
  const [name, setName] = useState("");
  const [presets, setPresets] = useState<TrainingPreset[]>(sampleTrainings);
  // Preserve existing in-memory preview setups across hot updates of their shape.
  useEffect(()=>setPresets(items=>items.some(item=>!item.id)?items.map(item=>item.id?item:{...item,id:crypto.randomUUID()}):items),[]);
  const [launchPreview, setLaunchPreview] = useState(false);
  const [sessionRun,setSessionRun]=useState<PreviewRun|null>(null);
  const [sessionProgress,setSessionProgress]=useState(0);
  const [recentOpen,setRecentOpen]=useState(false);
  const [recentActions,setRecentActions]=useState(previewHistory);
  const startPreview=(training:TrainingPreset)=>{
    setSessionRun({id:Date.now(),trainingId:training.id,name:training.name,draft:{...training.draft},translation:translationLanguage});
    setSessionProgress(0);setLaunchPreview(true);window.scrollTo({top:0,behavior:"instant"});
  };
  const navigate=(destination:typeof screen)=>{setLaunchPreview(false);setScreen(destination);};
  const resumable=sessionRun&&sessionProgress<sessionRun.draft.size?sessionRun:null;
  const [countState, setCountState] = useState<{status: "pending" | "ready" | "error"; count: number}>({status: "pending", count: 0});
  const [simulation, setSimulation] = useState("normal");
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  useEffect(() => { setNounOpen(false);  }, [screen]);
  useEffect(() => {
    const version = ++generation.current;
    setCountState({status: "pending", count: 0});
    const timer = setTimeout(() => {
      if(version !== generation.current) return;
      setCountState(simulation === "error" ? {status: "error", count: 0} : {status: "ready", count: simulation === "empty" ? 0 : matchMeanings(draft).length});
    }, simulation === "slow" ? 1600 : 400);
    return () => clearTimeout(timer);
  }, [draft, simulation, retry]);
  const update = (patch: Partial<Draft>) => setDraft(d => ({...d, ...patch}));
  const toggleSection = (id: string) => { if(id === "filters" && open.includes(id)) setNounOpen(false); setOpen(o => o.includes(id) ? o.filter(x => x !== id) : [...o, id]); };
  const source = sources.find(x => x.id === draft.source)!;
  const chooseExercise = (type: Exercise) => {
    if(type === "Translation" && !draft.types.includes("Translation")) wordDirections.current=draft.directions;
    update({types:[type],directions:type === "Translation" ? ["Reverse"] : draft.types.includes("Translation") ? wordDirections.current : draft.directions});
  };
  const previewType: Exercise = draft.types.includes("Words") ? "Words" : draft.types.includes("Idioms") ? "Idioms" : "Translation";
  const pair = draft.language === "English" ? (previewType === "Words" ? ["bicycle", "A vehicle with two wheels that you move by pedalling."] : previewType === "Idioms" ? ["Break the ice", "Make people feel more relaxed when they first meet."] : ["I cycle to work.", "Ik ga met de fiets naar mijn werk."]) : previewType === "Words" ? ["de fiets", "Een voertuig met twee wielen waarop je trapt."] : previewType === "Idioms" ? ["Met de deur in huis vallen", "Meteen zeggen waar het om gaat."] : ["I cycle to work.", "Ik ga met de fiets naar mijn werk."];
  const summary = <span className={s.inlineSummary}>{draft.types.join(" + ")}<span className={s.separator}>·</span>{previewType === "Translation" ? translationLanguage === "Off" ? "Choose translation language" : `${translationLanguage} → ${draft.language}` : draft.directions.join(" + ")}<span className={s.separator}>·</span>{draft.mode}</span>;
  const hasArticleFilter = draft.language === "Dutch";
  const activeDot = <span className={s.activeDot} role="img" aria-label="Subfilters active"/>;
  const toggleNounEditor = () => {
    if(!draft.parts.includes("Nouns")) update({parts: [...draft.parts, "Nouns"]});
    setNounOpen(v => !v);
  };
  const available = countState.status === "pending" ? <><LoaderCircle className={s.spinner} size={15}/>Calculating meanings…</> : countState.status === "error" ? <>Couldn’t calculate. <button onClick={() => setRetry(v => v + 1)}>Retry</button></> : <>{countState.count} {countState.count === 1 ? "meaning" : "meanings"} available{countState.count === 0 ? " — adjust your filters" : ""}</>;

  const content = <div lang="en" style={textSizeStyles(textSize.size)} data-text-size={textSize.size} data-session={launchPreview} data-disclosure={disclosure} data-training-home={screen==="home"&&!launchPreview} data-builder={screen==="builder"} data-library={screen==="library"} data-settings={screen==="settings"} data-colour-mode={dark?"dark":"light"} data-practice-palette={palette} data-design={variant} className={`${dark?"dark":""} ${s.root} ${themeStyles.theme} ${variant!=="current"?s[variant]:""} ${embedded?s.embedded:""} ${showSwitcher?s.withSwitcher:""} font-sense-sans`} onKeyDown={e => {if(e.key === "Escape")setNounOpen(false);}}>
    {nounPresent && <button className={`${s.filterScrim} ${!nounOpen ? s.leaving : ""}`} tabIndex={-1} aria-hidden={!nounOpen} aria-label="Close noun subfilters" onClick={() => setNounOpen(false)}/> }
    <div className={s.prototypeBanner}>INTERACTIVE PROTOTYPE · illustrative data · <a href="?view=compare">Compare four designs ↗</a></div>
    <header className={s.appHeader}><button className={s.brand} onClick={() => navigate("home")}>2000<span>nl</span></button>
      <div className={s.desktopNav} lang={interfaceLanguage}><AppDestinationNav active={screen === "settings" ? null : screen === "builder" || screen === "home" ? "training" : screen} interfaceLanguage={interfaceLanguage} onNavigate={v => navigate(v === "training" ? "home" : v === "library" ? "library" : "statistics")}/></div>
      <div className={s.headerTools}><button className={s.iconButton} aria-label={`Colour mode: ${colourMode}. Switch to ${colourMode==="Light"?"Dark":colourMode==="Dark"?"System":"Light"}`} onClick={()=>setColourMode(colourMode==="Light"?"Dark":colourMode==="Dark"?"System":"Light")}>{colourMode==="Light"?<Sun size={18}/>:colourMode==="Dark"?<Moon size={18}/>:<Monitor size={18}/>}</button><button className={s.iconButton} aria-label={appDestinationLabel(interfaceLanguage,"settings")} aria-current={screen==="settings"?"page":undefined} onClick={() => {if(screen!=="settings")previousScreen.current=screen;navigate("settings");window.scrollTo({top:0,behavior:"instant"});}}><Settings size={19}/></button></div>
    </header>
    <main className={`${s.main} ${screen==="library"?s.libraryMain:""}`}>
      <div hidden={screen!=="settings"}><SettingsPrototype textSize={textSize} resolvedDark={dark} palette={palette} onPaletteChange={changePalette} translation={translationLanguage} setTranslation={setTranslationLanguage} interfaceLanguage={interfaceLanguage} onInterfaceLanguageChange={setInterfaceLanguage} mode={colourMode} onModeChange={setColourMode} active={screen==="settings"} onExit={()=>{setScreen(previousScreen.current);window.scrollTo({top:0,behavior:"instant"});}}/></div>
      <div hidden={launchPreview}>
      {screen === "settings" ? null : screen === "builder" ? <>
        <div className={s.title}><button className={s.iconButton} aria-label="Back to Training" onClick={() => setScreen("home")}><ArrowLeft size={20}/></button><h1>{editingTraining===null?"Session builder":presets[editingTraining].name}</h1></div>
        <div className={s.panel}>
          <Section id="language" title="Language" summary={draft.language} open={open.includes("language")} onToggle={()=>toggleSection("language")}>
            <BuilderScopePicker page="language" draft={draft} onApply={patch=>{update(patch);setNounOpen(false);}}/>
          </Section>
          <Section id="source" title="Source" summary={source.name} open={open.includes("source")} onToggle={()=>toggleSection("source")}>
            <BuilderScopePicker key={draft.language} page="source" draft={draft} onApply={update}/>
          </Section>
          <Section id="exercises" title="Exercises" summary={summary} open={open.includes("exercises")} onToggle={() => toggleSection("exercises")}>
            <div className={s.field}><h2>Exercise type</h2><div className={s.choices}>{(["Words","Idioms","Translation"] as const).map(t => <Choice key={t} active={draft.types.includes(t)} onClick={() => chooseExercise(t)}>{t}</Choice>)}</div></div>
            {previewType === "Translation" ? <TranslationDirectionPreview from={translationLanguage} to={draft.language}/> : <div className={s.field}><h2>Direction <span className={s.muted}>{previewType === "Idioms" ? "Idiom" : "Meaning"} example</span></h2>
              <Directions values={draft.directions} pair={pair} onChange={directions=>update({directions})}/>
            </div>}
            <div className={s.field}><h2>Answer mode</h2><div className={s.choices}>{(["Reveal & self-rate","Type the answer"] as const).map(mode => <Choice key={mode} active={draft.mode === mode} onClick={() => update({mode})}>{mode}</Choice>)}</div></div>
          </Section>
          <Section id="filters" title="Filters" summary={<span className={s.inlineSummary}>{draft.parts.length ? draft.parts.map((p,i) => <React.Fragment key={p}>{i > 0 && <span className={s.separator}>·</span>}<span>{p}{p === "Nouns" && draft.article && activeDot}</span></React.Fragment>) : "All parts of speech"}</span>} open={open.includes("filters")} onToggle={() => toggleSection("filters")}>
            <div className={s.field}><h2>Part of speech</h2><div className={s.parts}>{parts.map(part => <div className={`${s.part} ${draft.parts.includes(part) ? s.selected : ""} ${part === "Nouns" && nounPresent ? s.activePart : ""}`} key={part}>
              <button aria-pressed={draft.parts.includes(part)} onClick={() => {
                const removing = draft.parts.includes(part);
                update({parts: removing ? draft.parts.filter(p => p !== part) : [...draft.parts,part], ...(part === "Nouns" && removing ? {article:null} : {})});
                if(part === "Nouns" && removing) setNounOpen(false);
              }}>{part}{part === "Nouns" && draft.article && activeDot}</button>
              {part === "Nouns" && hasArticleFilter && <button className={`${s.disclosure} ${nounOpen ? s.disclosureOpen : ""}`} aria-label="Noun subfilters" aria-expanded={nounOpen} aria-controls="noun-panel noun-panel-mobile" onClick={toggleNounEditor}><ChevronDown size={15} className={nounOpen ? s.rotated : ""}/></button>}
              {part === "Nouns" && nounPresent && <div id="noun-panel-mobile" inert={!nounOpen} aria-hidden={!nounOpen} className={`${s.mobileNounPanel} ${!nounOpen ? s.leaving : ""}`} role="group" aria-label="Noun article"><h2>Article</h2><div className={s.choices}>{(["de","het"] as const).map(article => <Choice key={article} active={draft.article === article} onClick={() => update({article: draft.article ? null : article})}>{article}</Choice>)}</div></div>}
            </div>)}</div></div>
            <div className={`${s.nounReveal} ${nounOpen ? s.nounRevealOpen : ""}`} inert={!nounOpen} aria-hidden={!nounOpen}><div><div id="noun-panel" className={s.nounPanel}><h2>Article</h2><div className={s.choices}>{(["de","het"] as const).map(article => <Choice key={article} active={draft.article === article} onClick={() => update({article: draft.article ? null : article})}>{article}</Choice>)}</div></div></div></div>
          </Section>
          <Section id="session" title="Session" summary={<span>{draft.size} exercises · {balances[draft.balance]}</span>} open={open.includes("session")} onToggle={() => toggleSection("session")}>
            <div className={s.sessionFields}><label>Session size <strong>{draft.size} exercises</strong><RangeControl label="Session size" min={5} max={50} step={5} value={draft.size} onChange={size=>update({size})}/><span className={s.rangeEnds}><span>5</span><span>50</span></span></label>
            <label>New / review balance <strong>{balances[draft.balance]}</strong><RangeControl label="New review balance" min={0} max={balances.length-1} value={draft.balance} onChange={balance=>update({balance})}/><span className={s.rangeEnds}><span>Review</span><span>New</span></span></label></div>
          </Section>
          {editingTraining!==null&&<SavedTrainingControls name={presets[editingTraining].name} main={editingTraining===mainTraining} hasOthers={presets.length>1} onMain={()=>setMainTraining(editingTraining)} onDelete={()=>{
            const removed=editingTraining;
            setPresets(items=>items.filter((_,index)=>index!==removed));
            setMainTraining(current=>current===removed?0:current>removed?current-1:current);
            setEditingTraining(null);setDraft({...initialDraft});setOpen([]);setScreen("home");
          }}/>}
          <footer className={s.actions}><div className={s.availability} role="status" aria-live="polite">{available}</div><Action  onClick={() => {setName(editingTraining===null?"":presets[editingTraining].name);setSaveDialog(true);}}>Save training</Action><Action primary disabled={countState.status !== "ready" || countState.count === 0 || previewType === "Translation" && (translationLanguage === "Off" || translationLanguage === draft.language)} onClick={() => startPreview({id:editingTraining===null?"draft":presets[editingTraining].id,name:editingTraining===null?"Custom training":presets[editingTraining].name,draft})}>Start training</Action></footer>
        </div>
      </> : screen === "home" ? statisticsTraining ? <section className={s.homeCard}><p className={s.eyebrow}>SELECTED TRAINING · PREVIEW</p><h2>{statisticsTraining}</h2><p>Your selection from Statistics. This illustrative setup has not started a session.</p><Action onClick={()=>setScreen("statistics")}>Back to statistics</Action><Action onClick={()=>setStatisticsTraining(null)}>Choose another training</Action></section> : <TrainingHome resume={resumable?{sessionId:String(resumable.id),trainingId:resumable.trainingId,completed:sessionProgress,total:resumable.draft.size}:undefined} onResume={()=>setLaunchPreview(true)} presets={resumable&&!presets.some(p=>p.id===resumable.trainingId)?[...presets,{id:resumable.trainingId,name:resumable.name,draft:resumable.draft}]:presets} mainIndex={mainTraining} translation={translationLanguage} interfaceLanguage={interfaceLanguage}
        onEdit={index=>{const selected=presets[index];setEditingTraining(selected?index:null);setDraft({...selected?.draft??resumable?.draft??initialDraft});setOpen([]);setScreen("builder");}}
        onLaunch={index=>startPreview(presets[index])}
        onNew={()=>{setEditingTraining(null);setDraft({...initialDraft});setOpen([]);setScreen("builder");}}/>
      : screen === "library" ? <LibraryPrototype/> : <StatisticsPrototype onHistory={()=>setRecentOpen(true)} onTrain={name=>{setStatisticsTraining(name);setScreen("home");window.scrollTo({top:0,behavior:"instant"});}}/>}

      </div>
      {sessionRun&&<TrainingSessionPrototype key={sessionRun.id} run={sessionRun} active={launchPreview} onClose={()=>{setLaunchPreview(false);setScreen("home");setStatisticsTraining(null);}} onHistory={()=>setRecentOpen(true)} onAction={action=>setRecentActions(items=>[action,...items])} onProgress={setSessionProgress}/>}
      <details hidden={launchPreview} id="prototype-inspector" className={s.inspector}><summary>Prototype controls & state</summary><label>Count simulation <select value={simulation} onChange={e => setSimulation(e.target.value)}><option value="normal">Fixture count</option><option value="slow">Slow count</option><option value="empty">Zero results</option><option value="error">Count error</option></select></label><p>Fixture meanings only. No API calls, account changes, scheduling, or persisted presets. Exercise mixing and typed answers are interaction previews, not claims of backend support.</p><pre>{JSON.stringify({draft, open, nounOpen, countState, matchingMeaningIds: matchMeanings(draft).map(m => m.id)}, null, 2)}</pre></details>
    </main>
    <nav className={s.mobileNav} lang={interfaceLanguage} aria-label={getUiMessages(interfaceLanguage).navigation.primary}>{[{destination:"training" as const,id:"home",Icon:Play},{destination:"library" as const,id:"library",Icon:Library},{destination:"statistics" as const,id:"statistics",Icon:ChartNoAxesColumn}].map(({destination,id,Icon}) => <button key={id} aria-current={screen === id || id === "home" && screen === "builder" ? "page" : undefined} onClick={() => navigate(id as "home" | "library" | "statistics")}><Icon size={18}/>{appDestinationLabel(interfaceLanguage,destination)}</button>)}</nav>
    {screen==="builder"&&!embedded&&!launchPreview&&<BuilderDisclosureVariation value={disclosure} onChange={changeDisclosure}/>}
    {saveDialog && <Modal title="Save training" onClose={() => setSaveDialog(false)}><form onSubmit={e => {e.preventDefault(); if(!name.trim())return;setPresets(p => editingTraining===null?[...p,{id:crypto.randomUUID(),name:name.trim(),draft:{...draft}}]:p.map((item,index)=>index===editingTraining?{...item,name:name.trim(),draft:{...draft}}:item));setSaveDialog(false);setScreen("home");}}><div className={s.sourceTools}><label className={s.nameLabel}>Training name<input autoFocus required maxLength={80} placeholder="e.g. My everyday Dutch" value={name} onChange={e => setName(e.target.value)}/></label></div><div className={s.modalActions}><Action type="button"  onClick={() => setSaveDialog(false)}>Cancel</Action><Action primary type="submit" disabled={!name.trim()}>Save training</Action></div></form></Modal>}
    {recentOpen&&<RecentActivity items={recentActions} onClose={()=>setRecentOpen(false)}/>}
  </div>;
  return <DesignContext.Provider value={variant}>{variant==="radix"?<Theme appearance="light" accentColor="violet" grayColor="mauve" radius="medium" scaling="100%">{content}</Theme>:content}{showSwitcher&&<VariantSwitcher variant={variant}/>}</DesignContext.Provider>;
}
