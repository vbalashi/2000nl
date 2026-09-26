"use client";

import React, { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, BookOpen, ChartNoAxesColumn, Check, ChevronDown, Library, LoaderCircle, Play, Search, Settings, X } from "lucide-react";
import { AppDestinationNav } from "@/components/navigation/AppDestinationNav";
import { balances, Draft, Exercise, initialDraft, matchMeanings, parts, sources, toggleRequired } from "./model";
import s from "./prototype.module.css";

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
function Choice({active, onClick, children}: {active: boolean; onClick: () => void; children: React.ReactNode}) {
  return <button type="button" className={`${s.choice} ${active ? s.selected : ""}`} aria-pressed={active} onClick={onClick}>{children}</button>;
}
function Modal({title, onClose, children, compact = false}: {title: string; onClose: () => void; children: React.ReactNode; compact?: boolean}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className={`${s.modal} ${compact ? s.compactModal : ""}`} onCancel={onClose} onClick={e => { if(e.target === e.currentTarget) onClose(); }} aria-label={title}>
    <div className={s.modalHeader}><h2>{title}</h2><button className={s.iconButton} aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div>{children}
  </dialog>;
}

export function BuilderPrototype() {
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [screen, setScreen] = useState<"builder" | "home" | "library" | "statistics">("builder");
  const [open, setOpen] = useState<string[]>(["exercises", "filters"]);
  const [nounOpen, setNounOpen] = useState(false);
  const [sourceDialog, setSourceDialog] = useState(false);
  const [languageDialog, setLanguageDialog] = useState(false);
  const [nounPresent, setNounPresent] = useState(false);
  useEffect(() => {
    if (nounOpen) { setNounPresent(true); return; }
    const timer = setTimeout(() => setNounPresent(false), 220);
    return () => clearTimeout(timer);
  }, [nounOpen]);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("All");
  const [pendingSource, setPendingSource] = useState(draft.source);
  const [saveDialog, setSaveDialog] = useState(false);
  const [name, setName] = useState("");
  const [presets, setPresets] = useState<{name: string; draft: Draft}[]>([]);
  const [launchPreview, setLaunchPreview] = useState(false);
  const [countState, setCountState] = useState<{status: "pending" | "ready" | "error"; count: number}>({status: "pending", count: 0});
  const [simulation, setSimulation] = useState("normal");
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  useEffect(() => { setNounOpen(false); }, [screen]);
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
  const previewType: Exercise = draft.types.includes("Words") ? "Words" : draft.types.includes("Idioms") ? "Idioms" : "Translation";
  const pair = draft.language === "English" ? (previewType === "Words" ? ["bicycle", "A vehicle with two wheels that you move by pedalling."] : previewType === "Idioms" ? ["Break the ice", "Make people feel more relaxed when they first meet."] : ["I ride my bicycle to work.", "bicycle → fiets"]) : previewType === "Words" ? ["de fiets", "Een voertuig met twee wielen waarop je trapt."] : previewType === "Idioms" ? ["Met de deur in huis vallen", "Meteen zeggen waar het om gaat."] : ["Ik ga met de fiets naar mijn werk.", "fiets → bicycle"];
  const summary = <span className={s.inlineSummary}>{draft.types.join(" + ")}<span className={s.separator}>·</span>{draft.directions.join(" + ")}<span className={s.separator}>·</span>{draft.mode}</span>;
  const filteredSources = sources.filter(x => x.language === draft.language);
  const hasArticleFilter = draft.language === "Dutch";
  const activeDot = <span className={s.activeDot} role="img" aria-label="Subfilters active"/>;
  const showSource = () => {setPendingSource(draft.source); setQuery(""); setSourceDialog(true);};
  const toggleNounEditor = () => {
    if(!draft.parts.includes("Nouns")) update({parts: [...draft.parts, "Nouns"]});
    setNounOpen(v => !v);
  };
  const available = countState.status === "pending" ? <><LoaderCircle className={s.spinner} size={15}/>Calculating meanings…</> : countState.status === "error" ? <>Couldn’t calculate. <button onClick={() => setRetry(v => v + 1)}>Retry</button></> : <>{countState.count} {countState.count === 1 ? "meaning" : "meanings"} available{countState.count === 0 ? " — adjust your filters" : ""}</>;

  return <div className={`${s.root} font-sense-sans`} onKeyDown={e => {if(e.key === "Escape")setNounOpen(false);}}>
    {nounPresent && <button className={`${s.filterScrim} ${!nounOpen ? s.leaving : ""}`} tabIndex={-1} aria-hidden={!nounOpen} aria-label="Close noun subfilters" onClick={() => setNounOpen(false)}/> }
    <div className={s.prototypeBanner}>INTERACTIVE PROTOTYPE · illustrative data · nothing is saved to your account</div>
    <header className={s.appHeader}><button className={s.brand} onClick={() => setScreen("home")}>2000<span>nl</span></button>
      <div className={s.desktopNav}><AppDestinationNav active={screen === "builder" || screen === "home" ? "training" : screen} interfaceLanguage="en" onNavigate={v => setScreen(v === "training" ? "home" : v === "library" ? "library" : "statistics")}/></div>
      <button className={s.iconButton} aria-label="Show prototype state" onClick={() => document.getElementById("prototype-inspector")?.scrollIntoView({behavior:"smooth"})}><Settings size={19}/></button>
    </header>
    <main className={s.main}>
      {screen === "builder" ? <>
        <div className={s.title}><button className={s.iconButton} aria-label="Back to Training" onClick={() => setScreen("home")}><ArrowLeft size={20}/></button><h1>Session builder</h1></div>
        <div className={s.panel}>
          <button className={s.language} onClick={() => setLanguageDialog(true)} aria-haspopup="dialog"><span>Learning language</span><span>{draft.language}</span><ChevronDown size={16}/></button>
          <Section id="material" title="Material" summary={<span>{source.name}<small>{source.kind}</small></span>} open={open.includes("material")} onToggle={() => toggleSection("material")}>
            <div className={s.material}><BookOpen size={22}/><div><strong>{source.name}</strong><p>{source.kind} · {source.count} sample meanings</p></div><button className={s.secondary} onClick={showSource}>Change source</button></div>
          </Section>
          <Section id="exercises" title="Exercises" summary={summary} open={open.includes("exercises")} onToggle={() => toggleSection("exercises")}>
            <div className={s.field}><h2>Exercise type</h2><div className={s.choices}>{(["Words","Idioms","Translation"] as const).map(t => <Choice key={t} active={draft.types.includes(t)} onClick={() => update({types: toggleRequired(draft.types,t)})}>{t}</Choice>)}</div></div>
            {draft.types.includes("Translation") && <p className={s.muted}>Translation language: {draft.language === "Dutch" ? "English" : "Dutch"} · target word in sentence context</p>}
            <div className={s.field}><h2>Direction <span className={s.muted}>{previewType === "Translation" ? "Translation" : previewType === "Idioms" ? "Idiom" : "Meaning"} example</span></h2>
              <div className={s.directions}>{(["Direct","Reverse"] as const).map(direction => {
                const direct = direction === "Direct";
                return <button key={direction} className={`${s.direction} ${draft.directions.includes(direction) ? s.directionSelected : ""}`} aria-pressed={draft.directions.includes(direction)} onClick={() => update({directions: toggleRequired(draft.directions,direction)})}>
                  <span className={s.directionHeading}>{direction}<span className={s.check}>{draft.directions.includes(direction) && <Check size={12}/>}</span></span>
                  <strong className={s.prompt}>{pair[direct ? 0 : 1]}</strong><ArrowDown size={13} className={s.directionArrow}/><span className={s.answer}>{pair[direct ? 1 : 0]}</span>
                </button>;
              })}</div>
            </div>
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
            <div className={s.sessionFields}><label>Session size <strong>{draft.size} exercises</strong><input aria-label="Session size" type="range" min="5" max="50" step="5" value={draft.size} onChange={e => update({size:Number(e.target.value)})}/><span className={s.rangeEnds}><span>5</span><span>50</span></span></label>
            <label>New / review balance <strong>{balances[draft.balance]}</strong><input aria-label="New review balance" type="range" min="0" max={balances.length-1} value={draft.balance} onChange={e => update({balance:Number(e.target.value)})}/><span className={s.rangeEnds}><span>Review</span><span>New</span></span></label></div>
          </Section>
          <footer className={s.actions}><div className={s.availability} role="status" aria-live="polite">{available}</div><button className={s.secondary} onClick={() => {setName("");setSaveDialog(true);}}>Save preset</button><button className={s.primary} disabled={countState.status !== "ready" || countState.count === 0} onClick={() => setLaunchPreview(true)}>Start training</button></footer>
        </div>
      </> : screen === "home" ? <>
        <div className={s.title}><h1>Your practice</h1></div><section className={s.homeCard}><p className={s.eyebrow}>READY WHEN YOU ARE</p><h2>A little practice, every day.</h2><p>Your current setup is kept while you explore.</p><button className={s.primary} onClick={() => setScreen("builder")}>Continue setup</button><button className={s.secondary} onClick={() => {setDraft({...initialDraft});setNounOpen(false);setScreen("builder");}}>New session</button></section>
        <h2 className={s.savedTitle}>Saved presets</h2>{presets.length ? presets.map((preset,i) => <button className={s.preset} key={i} onClick={() => {setDraft({...preset.draft});setNounOpen(false);setScreen("builder");}}><span>{preset.name}<small>{preset.draft.types.join(" · ")}</small></span><ChevronDown size={18}/></button>) : <p className={s.muted}>Presets saved in this preview will appear here until you reload.</p>}
      </> : <section className={s.homeCard}><h1>{screen === "library" ? "Library" : "Statistics"}</h1><p>This preview focuses on building a session.</p><button className={s.secondary} onClick={() => setScreen("builder")}>Return to builder</button></section>}
      <details id="prototype-inspector" className={s.inspector}><summary>Prototype controls & state</summary><label>Count simulation <select value={simulation} onChange={e => setSimulation(e.target.value)}><option value="normal">Fixture count</option><option value="slow">Slow count</option><option value="empty">Zero results</option><option value="error">Count error</option></select></label><p>Fixture meanings only. No API calls, account changes, scheduling, or persisted presets. Exercise mixing and typed answers are interaction previews, not claims of backend support.</p><pre>{JSON.stringify({draft, open, nounOpen, countState, matchingMeaningIds: matchMeanings(draft).map(m => m.id)}, null, 2)}</pre></details>
    </main>
    <nav className={s.mobileNav} aria-label="Mobile primary navigation">{[{name:"Training",id:"home",Icon:Play},{name:"Library",id:"library",Icon:Library},{name:"Statistics",id:"statistics",Icon:ChartNoAxesColumn}].map(({name,id,Icon}) => <button key={id} aria-current={screen === id || id === "home" && screen === "builder" ? "page" : undefined} onClick={() => setScreen(id as "home" | "library" | "statistics")}><Icon size={18}/>{name}</button>)}</nav>
    {languageDialog && <Modal compact title="Learning language" onClose={() => setLanguageDialog(false)}><div className={s.languageList}>{(["Dutch", "English"] as const).map(language => <button className={s.languageOption} key={language} aria-pressed={draft.language === language} onClick={() => {
      if(language !== draft.language) { update({language, source:language === "Dutch" ? "core" : "english-core", parts:[], article:null}); setNounOpen(false); }
      setLanguageDialog(false);
    }}><span>{language}{language === "Dutch" && <small>Nederlands</small>}</span><span className={s.check}>{draft.language === language && <Check size={12}/>}</span></button>)}</div><p className={s.languageNote}>Demo languages. Changing language resets the source and language-specific filters.</p></Modal>}
    {sourceDialog && <Modal title="Choose source" onClose={() => setSourceDialog(false)}><div className={s.sourceTools}><div className={s.choices}>{["All","Dictionary","Collection"].map(k => <Choice key={k} active={kind===k} onClick={() => setKind(k)}>{k === "All" ? "All" : k === "Dictionary" ? "Dictionaries" : "Collections"}</Choice>)}</div><label className={s.search}><Search size={18}/><input autoFocus placeholder="Search sources" value={query} onChange={e => setQuery(e.target.value)}/></label></div>
      <div className={s.sourceList}>{filteredSources.filter(x => (kind === "All" || x.kind === kind) && x.name.toLowerCase().includes(query.toLowerCase())).map(x => <label className={s.sourceRow} key={x.id}><input type="radio" name="source" checked={pendingSource === x.id} onChange={() => setPendingSource(x.id)}/><span>{x.name}<small>{x.kind} · {x.count} sample meanings</small></span></label>)}{!filteredSources.some(x => (kind === "All" || x.kind === kind) && x.name.toLowerCase().includes(query.toLowerCase())) && <p className={s.muted}>No matching sources</p>}</div><div className={s.modalActions}><button className={s.secondary} onClick={() => setSourceDialog(false)}>Cancel</button><button className={s.primary} onClick={() => {update({source:pendingSource});setSourceDialog(false);}}>Use source</button></div></Modal>}
    {saveDialog && <Modal title="Save as preset" onClose={() => setSaveDialog(false)}><form onSubmit={e => {e.preventDefault(); if(!name.trim())return;setPresets(p => [...p,{name:name.trim(),draft:{...draft}}]);setSaveDialog(false);setScreen("home");}}><div className={s.sourceTools}><label className={s.nameLabel}>Training name<input autoFocus required maxLength={80} placeholder="e.g. My everyday Dutch" value={name} onChange={e => setName(e.target.value)}/></label></div><div className={s.modalActions}><button type="button" className={s.secondary} onClick={() => setSaveDialog(false)}>Cancel</button><button className={s.primary} type="submit" disabled={!name.trim()}>Save preset</button></div></form></Modal>}
    {launchPreview && <Modal title="Session preview" onClose={() => setLaunchPreview(false)}><div className={s.sourceTools}><p>{countState.count} matching sample meanings · {draft.size} requested exercises.</p><p>This is where the real session will start after integration. No training or learning-state changes have been made.</p></div><div className={s.modalActions}><button className={s.primary} onClick={() => setLaunchPreview(false)}>Back to setup</button></div></Modal>}
  </div>;
}
