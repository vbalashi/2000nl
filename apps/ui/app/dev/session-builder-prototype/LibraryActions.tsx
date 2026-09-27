"use client";
import React, { useEffect, useRef, useState } from "react";
import { List, EyeOff, Flag, MoreHorizontal, ChevronDown } from "lucide-react";
import { TrainingCardReviewButton } from "@/components/training/v2/TrainingCardTemplates";
import type { LibraryStudy } from "./libraryStudy";
import s from "./library.module.css";
export type DemoLearningState = "new" | "learning" | "known" | "excluded";
export function LibraryButton({ children, primary = false, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return <button type="button" {...props} className={`${s.button} ${primary ? s.primary : ""} ${props.className || ""}`}>{children}</button>;
}
export function LibraryIconButton({ label, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" {...props} aria-label={label} title={label} className={`${s.iconButton} ${props.className || ""}`}>{children}</button>;
}
export function MeaningActions({ study, state, onState, onNotice }: { study: LibraryStudy; state: DemoLearningState; onState: (s: DemoLearningState) => void; onNotice: (s: string) => void }) {
  const [panel, setPanel] = useState<"collections" | "exclude" | "report" | "more" | null>(null);
  const [collection, setCollection] = useState(false);
  const [reason, setReason] = useState("Content issue");
  const [rating, setRating] = useState("");
  const region = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!panel) return;
    region.current?.querySelector<HTMLElement>(`[data-action-panel] button, [data-action-panel] input, [data-action-panel] select`)?.focus();
    const dismiss = (e: PointerEvent) => { if (!region.current?.contains(e.target as Node)) setPanel(null); };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [panel]);
  function toggle(next: typeof panel, e: React.MouseEvent<HTMLButtonElement>) { trigger.current = e.currentTarget; setPanel(panel === next ? null : next); }
  function close() { setPanel(null); trigger.current?.focus(); }
  function change(next: DemoLearningState) { onState(next); close(); onNotice(`${next === "known" ? "Marked as known" : "Manually excluded"} · local demo only`); }
  return <div ref={region} className={s.actionGroup} data-grouping={study.actions} onKeyDown={e => { if (e.key === "Escape" && panel) { e.stopPropagation(); close(); } }}>
    <div className={s.actions}>
      {state === "known" || state === "excluded" ? <LibraryButton onClick={() => onState("new")}>Undo {state === "known" ? "known" : "exclusion"}</LibraryButton> : study.scene === "review" ? <div className={s.reviewButtons} aria-label="Review ratings">{([["fail", "Again"], ["hard", "Hard"], ["success", "Good"], ["easy", "Easy"]] as const).map(([result, label]) => <TrainingCardReviewButton key={result} result={result} label={label} busy={false} onClick={() => { setRating(label); onNotice(`${label} · demo rating, no review recorded`); }}/>)}</div> : <LibraryButton primary onClick={() => { if (state === "new") { onState("learning"); onNotice("Added to learning · local demo only"); } else onNotice("Train next · no session started"); }}>{state === "new" ? "Learn" : "Train next"}</LibraryButton>}
    </div>
    <div className={s.secondaryActions}>
      <button aria-expanded={panel === "collections"} onClick={e => toggle("collections", e)}><List size={14}/>Collections{collection ? " · 1" : ""}</button>
      {study.actions === "toolbar" ? <button aria-label="More card actions" aria-expanded={panel === "more" || panel === "exclude" || panel === "report"} onClick={e => toggle("more", e)}><MoreHorizontal size={18}/></button> : <><button className={s.reportAction} aria-label="Report" title="Report" onClick={e => toggle("report", e)} aria-expanded={panel === "report"}><Flag size={13}/><span>Report</span></button><button onClick={e => toggle("exclude", e)} aria-expanded={panel === "exclude"}><EyeOff size={14}/>Exclude<ChevronDown size={12}/></button></>}
    </div>
    {panel && <div className={s.actionPanel} data-action-panel>
      {panel === "collections" && <><label><input type="checkbox" checked={collection} onChange={e => setCollection(e.target.checked)}/>Everyday Dutch</label><button onClick={close}>Done</button></>}
      {panel === "exclude" && <><button onClick={() => change("known")}>Mark as known</button><button onClick={() => change("excluded")}>Manual exclude</button></>}
      {panel === "more" && <><button onClick={() => setPanel("exclude")}><EyeOff size={14}/>Exclude</button><button onClick={() => setPanel("report")}><Flag size={14}/>Report</button></>}
      {panel === "report" && <><label>Report<select value={reason} onChange={e => setReason(e.target.value)}><option>Content issue</option><option>Wrong meaning</option><option>Other</option></select></label><button onClick={() => { close(); onNotice(`${reason} · demo report, nothing sent`); }}>Preview report</button></>}
    </div>}
    {rating && study.scene === "review" && <small className={s.ratingFeedback} role="status">{rating} · demo only</small>}
  </div>;
}
