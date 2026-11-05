import {useTrainingSourcePage} from '@/components/library/sharing/useTrainingSourcePage';
import React, { useState, useRef, useLayoutEffect, useEffect, useId } from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { TrainingSetupOption } from "@/lib/training/setups/availability";
import type { TrainingSetupDraft } from "@/lib/training/setups/types";
import type { TrainingSessionSize } from "@/lib/types";
import s from "./trainingSourcePicker.module.css";
import { SegmentedControl } from "@/components/practice/ui/SegmentedControl";
import { BuilderChoice } from "@/components/practice/builder/BuilderChoice";
import { IconAction } from "@/components/practice/ui/IconAction";
import { Search, BookOpen, Layers, Check, ChevronUp, ChevronDown } from "lucide-react";
export function TrainingSourcePicker({
  locale,
  lists,
  dictionaries,
  draft,
  onChange,
  disabled = false,
  renderSection,
  expanded = true,
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
  expanded?: boolean;
  /** Keeps query, type and paging state here while the builder places the toolbar. */
  renderSection?: (parts: {
    toolbar: React.ReactNode;
    content: React.ReactNode;
  }) => React.ReactNode;
}) {
  const [search, setSearch] = useState(false),
    [query, setQuery] = useState(""),
    [kind, setKind] = useState("all");
  const searchId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (search) inputRef.current?.focus();
  }, [search]);
  useEffect(() => {
    if (!expanded) {
      setSearch(false);
      setQuery("");
    }
  }, [expanded]);
  const closeSearch = () => {
    setSearch(false);
    setQuery("");
    searchRef.current?.focus();
  };
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
  const visible = entries.filter(
    (x) =>
      (kind === "all" || kind === x.kind) &&
      (!search ||
        ('server'in x&&x.server||x.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()))),
  );
  const entryKey=entries.map(x=>`${x.value}:${x.label}`).join("|");
  useLayoutEffect(()=>{const el=listRef.current;if(!el)return;const observer=new ResizeObserver(updateEdges);observer.observe(el);updateEdges();return()=>observer.disconnect();},[query,kind,search,entryKey]);
  const scrollLabel=locale==="ru"?["Предыдущие источники","Следующие источники"]:locale==="nl"?["Vorige bronnen","Meer bronnen"]:["Previous sources","More sources"];
  const searchAction = (
    <IconAction
      ref={searchRef}
      label={labels[3]}
      className={s.searchAction}
      disabled={disabled}
      aria-expanded={search}
      aria-controls={searchId}
      onClick={() => {
        if (search) closeSearch();
        else {
          setSearch(true);
        }
      }}
    >
      <Search size={16} aria-hidden="true" />
    </IconAction>
  );
  const filters = (
    <SegmentedControl
      standard
      label={locale === "ru" ? "Тип источника" : locale === "nl" ? "Brontype" : "Source type"}
    >
      {["all", "dictionary", "collection"].map((value, i) => (
        <BuilderChoice
          key={value}
          active={kind === value}
          disabled={disabled}
          onClick={() => setKind(value)}
        >
          {labels[i]}
        </BuilderChoice>
      ))}
    </SegmentedControl>
  );
  const content = (
    <div data-onboarding="source-picker" className={s.source}>
      <div
        id={searchId}
        className={`${s.searchReveal} ${search ? s.searchOpen : ""}`}
        aria-hidden={!search}
        ref={node => {
          if (node) node.toggleAttribute("inert", !search);
        }}
      >
        <div>
          <input
          ref={inputRef}
          disabled={disabled}
          aria-label={labels[3]}
          placeholder={labels[3]}
          value={query}
          maxLength={200}
          onChange={e => setQuery([...e.target.value].slice(0,100).join(''))}
          onKeyDown={e => {
            if (e.key === "Escape") {
              e.preventDefault();
              closeSearch();
            }
          }}
          />
        </div>
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
              data-onboarding="source-option" data-source-value={x.value}
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
  const toolbar=<div className={s.source_toolbar}>{searchAction}{filters}</div>;
  return renderSection ? renderSection({ toolbar, content }) : (
    <>
      {toolbar}
      {content}
    </>
  );
}
