import {useTrainingSourcePage} from '@/components/library/sharing/useTrainingSourcePage';
import React, { useState, useRef, useLayoutEffect } from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { TrainingSetupOption } from "@/lib/training/setups/availability";
import type { TrainingSetupDraft } from "@/lib/training/setups/types";
import type { TrainingSessionSize } from "@/lib/types";
import s from "./trainingSourcePicker.module.css";
import { Search, BookOpen, Layers, Check, ChevronUp, ChevronDown } from "lucide-react";
export function TrainingSourcePicker({
  locale,
  lists,
  dictionaries,
  draft,
  onChange,
  disabled = false,
}: {
  locale: OnboardingLanguage;
  lists: TrainingSetupOption[];
  dictionaries: TrainingSetupOption[];
  draft: TrainingSetupDraft & { sessionSize: TrainingSessionSize };
  onChange: React.Dispatch<
    React.SetStateAction<
      TrainingSetupDraft & { sessionSize: TrainingSessionSize }
    >
  >;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState(false),
    [query, setQuery] = useState(""),
    [kind, setKind] = useState("all");
  const remote=useTrainingSourcePage(query);
  const labels =
    locale === "ru"
      ? ["Все", "Словари", "Коллекции", "Поиск источников", "Нет совпадений"]
      : locale === "nl"
        ? [
            "Alles",
            "Woordenboeken",
            "Collecties",
            "Bronnen zoeken",
            "Geen resultaten",
          ]
        : [
            "All",
            "Dictionaries",
            "Collections",
            "Search sources",
            "No matches",
          ];
  const entries = [
    ...dictionaries.map((x) => ({ ...x, kind: "dictionary" })),
    ...lists.filter(x=>!remote.active||!x.value.startsWith('user:')).map((x) => ({ ...x, kind: "collection",server:false,ownership:undefined as undefined|'received'|'owned' })),
    ...(remote.active?remote.page.collections.map(row=>({value:'user:'+row.id,label:row.name,kind:'collection',server:true,ownership:row.ownership,disabled:false})):[]),
  ];
  const listRef=useRef<HTMLDivElement>(null);
  const [edges,setEdges]=useState({top:false,bottom:false});
  const updateEdges=()=>{const el=listRef.current;if(el)setEdges({top:el.scrollTop>1,bottom:el.scrollTop+el.clientHeight<el.scrollHeight-1});};
  const large = remote.active||entries.length > 10;
  const searching = search && large;
  const visible = entries.filter(
    (x) =>
      (!searching || kind === "all" || kind === x.kind) &&
      (!searching ||
        ('server'in x&&x.server||x.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()))),
  );
  const entryKey=entries.map(x=>`${x.value}:${x.label}`).join("|");
  useLayoutEffect(()=>{const el=listRef.current;if(!el)return;const observer=new ResizeObserver(updateEdges);observer.observe(el);updateEdges();return()=>observer.disconnect();},[query,kind,search,entryKey]);
  const scrollLabel=locale==="ru"?["Предыдущие источники","Следующие источники"]:locale==="nl"?["Vorige bronnen","Meer bronnen"]:["Previous sources","More sources"];
  return (
    <div className={s.source}>
      <div className={s.source_toolbar}>
        {large && (
          <button
            disabled={disabled}
            type="button"
            aria-label={labels[3]}
            aria-expanded={search}
            onClick={() => {setSearch(!search);if(search)setQuery('');}}
          >
            <Search size={15} />
          </button>
        )}
        {searching && (
          <>
            <input
              disabled={disabled}
              aria-label={labels[3]}
              placeholder={labels[3]}
              value={query}
              maxLength={200} onChange={(e) => setQuery([...e.target.value].slice(0,100).join(''))}
            />
            <select
              disabled={disabled}
              aria-label={labels[0]}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {["all", "dictionary", "collection"].map((k, i) => (
                <option key={k} value={k}>
                  {labels[i]}
                </option>
              ))}
            </select>
          </>
        )}
      </div>
      <div className={s.source_window}>
      {edges.top&&<button type="button" className={`${s.edge} ${s.edgeTop}`} aria-label={scrollLabel[0]} onClick={()=>listRef.current?.scrollBy({top:-180,behavior:"smooth"})}><ChevronUp size={14}/></button>}
      <div ref={listRef} className={s.source_list} onScroll={updateEdges}>
        {remote.active&&remote.status==='loading'&&<p role="status">{locale==='ru'?'Загрузка…':locale==='nl'?'Laden…':'Loading…'}</p>}
        {remote.active&&remote.status==='error'&&<button type="button" onClick={()=>void remote.retry()}>{locale==='ru'?'Повторить':locale==='nl'?'Opnieuw proberen':'Retry'}</button>}
        {visible.map((x) => {
          const active =
            x.kind === "dictionary"
              ? draft.materialMode === "all-dictionaries" ||
                (draft.materialMode === "selected-dictionaries" &&
                  draft.dictionaryIds?.includes(x.value))
              : draft.materialMode === "collection" &&
                draft.listValue === x.value;
          return (
            <button
              disabled={disabled||Boolean('disabled'in x&&x.disabled)}
              type="button"
              key={x.kind + ":" + x.value}
              aria-label={x.label}
              aria-pressed={Boolean(active)}
              onClick={() => {
                if(remote.active&&'server'in x&&x.server){const row=remote.page.collections.find(row=>'user:'+row.id===x.value);if(row)remote.scope?.onTrainingResolved?.([row.id],[row]);}
                onChange((d) =>
                  x.kind === "collection"
                    ? { ...d, materialMode: "collection", listValue: x.value }
                    : {
                        ...d,
                        materialMode: "selected-dictionaries",
                        dictionaryIds:
                          d.materialMode === "selected-dictionaries" &&
                          d.dictionaryIds?.includes(x.value)
                            ? d.dictionaryIds.filter((id) => id !== x.value)
                            : [
                                ...(d.materialMode === "selected-dictionaries"
                                  ? (d.dictionaryIds ?? [])
                                  : []),
                                x.value,
                              ],
                      },
                );}
              }
            >
              {x.kind === "dictionary" ? (
                <BookOpen size={14} />
              ) : (
                <Layers size={14} />
              )}
              <span>{x.label}</span>
              <small>{x.kind === "dictionary" ? labels[1] : labels[2]}</small>
              {active && <Check size={14} />}
            </button>
          );
        })}
        {remote.active&&remote.page.nextCursor&&<button type="button" disabled={remote.more} onClick={()=>void remote.loadMore()}>{locale==='ru'?'Показать ещё':locale==='nl'?'Meer tonen':'Show more'}</button>}
        {!visible.length && <p>{labels[4]}</p>}
      </div>
      {edges.bottom&&<button type="button" className={`${s.edge} ${s.edgeBottom}`} aria-label={scrollLabel[1]} onClick={()=>listRef.current?.scrollBy({top:180,behavior:"smooth"})}><ChevronDown size={14}/></button>}
      </div>
    </div>
  );
}
