"use client";
import React, { useRef, useState } from "react";
import { X, SlidersHorizontal } from "lucide-react";
import { LibraryStudy, StudyKey, studyAxes, studyPresets } from "./libraryStudy";
import s from "./libraryStudy.module.css";

type Props = { study: LibraryStudy; onChange: (s: LibraryStudy) => void; density: "compact" | "reading"; onDensity: (v: "compact" | "reading") => void; onBrowse: () => void };
export function LibraryStudyPanel({ study, onChange, density, onDensity, onBrowse }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const active = studyPresets.find(p => Object.keys(p.values).every(k => p.values[k as StudyKey] === study[k as StudyKey]));
  return <>
    <aside className={s.studyDock} aria-label="Design comparison" lang="en">
      <span>Library study · {active?.name || "Custom"}</span>
      <button onClick={() => { dialog.current?.showModal(); setOpen(true); }} aria-expanded={open}><SlidersHorizontal size={14}/> Variations</button>
    </aside>
    <dialog lang="en" aria-labelledby="library-study-title" ref={dialog} className={s.studyDialog} onClose={() => setOpen(false)} onClick={e => { if (e.target === e.currentTarget) dialog.current?.close(); }}>
      <div className={s.studySheet}>
        <header><div><h2 id="library-study-title">Library variation matrix</h2><p>Local demo · every choice updates the same components.</p></div><button aria-label="Close variations" onClick={() => dialog.current?.close()}><X size={18}/></button></header>
        <div className={s.studyPresets}>{studyPresets.map(p => <button key={p.id} aria-pressed={active?.id === p.id} onClick={() => onChange({ ...p.values })}><strong>{p.name}</strong><span>{p.description}</span></button>)}</div>
        <div className={s.studyTable} role="table" aria-label="Variation matrix">
          <div role="row"><div role="cell"><strong>Word list</strong><small>One-line scan or short definition preview.</small></div><div role="cell"><select aria-label="Word list" value={density} onChange={e => onDensity(e.target.value as Props["density"])}><option value="compact">A · Compact</option><option value="reading">B · Reading</option></select></div></div>
          {(Object.keys(studyAxes) as StudyKey[]).map(key => <div role="row" key={key}><div role="cell"><strong>{studyAxes[key].label}</strong><small>{studyAxes[key].note}</small></div><div role="cell"><select aria-label={studyAxes[key].label} value={study[key]} onChange={e => onChange({ ...study, [key]: e.target.value })}>{Object.entries(studyAxes[key].options).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>)}
        </div>
        <footer><button onClick={() => { onBrowse(); dialog.current?.close(); }}>Browse all words</button><button onClick={() => dialog.current?.close()}>View combination</button></footer>
      </div>
    </dialog>
  </>;
}
