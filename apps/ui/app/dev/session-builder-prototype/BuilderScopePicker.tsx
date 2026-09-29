"use client";
import { useState } from "react";
import { Check, Search } from "lucide-react";
import { sources, type Draft } from "./model";
import { Choice } from "./VariantControls";
import s from "./prototype.module.css";
import f from "./libraryFilters.module.css";
import p from "./builderScope.module.css";

export function BuilderScopePicker({ page, draft, onApply }: {
  page: "language" | "source"; draft: Draft; onApply: (patch: Partial<Draft>) => void;
}) {
  const selected = page === "language" ? draft.language : draft.source;
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("All");
  const options = page === "language"
    ? [{ id: "Dutch", name: "Dutch", kind: "Nederlands · nl · nld" }, { id: "English", name: "English", kind: "en · eng" }]
    : sources.filter(source => source.language === draft.language && (kind === "All" || source.kind === kind));
  const results = options.filter(option => `${option.name} ${option.kind}`.toLowerCase().includes(query.trim().toLowerCase()));
  const select = (id: string) => {
    if (page === "source") onApply({ source: id });
    else if (id !== draft.language) onApply({ language: id as Draft["language"], source: id === "Dutch" ? "core" : "english-core", parts: [], article: null });
  };
  return <div className={p.inlinePicker} aria-label={page === "language" ? "Choose language" : "Choose source"}>
    <div className={p.tools}>
      {page === "source" && <div className={s.choices}>{["All", "Dictionary", "Collection"].map(value => <Choice key={value} active={kind === value} onClick={() => setKind(value)}>{value === "Dictionary" ? "Dictionaries" : value === "Collection" ? "Collections" : "All"}</Choice>)}</div>}
      <label className={f.search}><Search size={17}/><input aria-label={page === "language" ? "Search languages" : "Search sources"} placeholder={page === "language" ? "Search languages…" : "Search sources…"} value={query} onChange={event => setQuery(event.target.value)}/></label>
    </div>
    <div className={p.list}><div className={f.group}>{results.map(option => <button className={f.row} key={option.id} aria-pressed={selected === option.id} onClick={() => select(option.id)}><span>{option.name}<small className={p.kind}>{option.kind}</small></span><span className={f.check} aria-hidden="true">{selected === option.id && <Check size={13}/>}</span></button>)}</div>{!results.length && <p className={f.help}>No matching {page === "language" ? "languages" : "sources"}.</p>}</div>
  </div>;
}
