
import { localizedField } from "@/lib/i18n/catalog";
import {usePersonalLabels} from '@/components/library/organization/usePersonalLabels';
import {useLabelSharingCatalog} from '@/components/library/sharing/useLabelSharingCatalog';
import {organizationCopy} from '@/components/library/organization/copy';
import {labelRows} from '@/lib/collections/labels/catalog';
import {useTrainingSourcePage} from '@/components/library/sharing/useTrainingSourcePage';
import React, { useState, useRef, useLayoutEffect, useEffect, useId } from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { TrainingSetupOption } from "@/lib/training/setups/availability";
import type { TrainingSetupDraft } from "@/lib/training/setups/types";
import type { TrainingSessionSize } from "@/lib/types";
import s from "./trainingSourcePicker.module.css";
import {SourceTypeControl,sourceTypeMatches,type SourceKind} from "@/components/practice/ui/SourceTypeControl";
import { IconAction } from "@/components/practice/ui/IconAction";
import { Search, BookOpen, Folder, Layers, Share2, Check, ChevronUp, ChevronDown } from "lucide-react";
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
    [kind, setKind] = useState<SourceKind>("all");
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
  const showCollections=kind!=='dictionary'&&kind!=='label';
  const remote=useTrainingSourcePage(query,kind==='shared'?'received':kind==='collection'?'owned':'all',showCollections);
  const {userId}=remote.scope??{userId:""};
  const ownLabelsEnabled=Boolean(userId)&&process.env.NEXT_PUBLIC_COLLECTION_ORGANIZATION_ENABLED==='true';
  const sharedLabelsEnabled=Boolean(userId)&&process.env.NEXT_PUBLIC_LABEL_SHARING_ENABLED==='true';
  const ownLabels=usePersonalLabels(expanded&&kind!=='dictionary'&&ownLabelsEnabled,userId);
  const sharedLabels=useLabelSharingCatalog(userId,expanded&&(kind==='all'||kind==='label'||kind==='shared')&&sharedLabelsEnabled);
  const labels=localizedField("sourcePicker", "labels")[locale];
  const labelCopy=organizationCopy(locale);
  const entries: Array<TrainingSetupOption & {kind:"dictionary"|"collection"|"label";server?:boolean}> = [
    ...dictionaries.map(x => ({ ...x, kind: "dictionary" as const })),
    ...lists.filter(x=>!remote.active||!x.value.startsWith('user:')).map(x => ({ ...x, kind: "collection" as const })),
    ...(ownLabelsEnabled?labelRows(ownLabels.snapshot,locale).map(({label,path})=>({value:label.id,label:path,kind:"label" as const,ownership:"owned" as const})):[]),
    ...(sharedLabels.data?.received??[]).map(group=>({value:group.labelId,label:group.name,kind:"label" as const,ownership:"received" as const})),
    ...(remote.active?remote.page.collections.map(row=>({value:'user:'+row.id,label:row.name,kind:'collection' as const,server:true,ownership:row.ownership})):[]),
  ];
  const listRef=useRef<HTMLDivElement>(null);
  const [edges,setEdges]=useState({top:false,bottom:false});
  const updateEdges=()=>{const el=listRef.current;if(el)setEdges({top:el.scrollTop>1,bottom:el.scrollTop+el.clientHeight<el.scrollHeight-1});};
  const visible = entries.filter(x =>
    sourceTypeMatches(kind,x.kind,x.ownership==='received') &&
    (!search||x.server||x.label.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale))),
  );
  const labelLoading=kind!=='dictionary'&&((kind!=='shared'&&ownLabelsEnabled&&ownLabels.loading)||sharedLabels.status==='loading');
  const ownLabelError=kind!=='dictionary'&&kind!=='shared'&&ownLabelsEnabled&&ownLabels.error;
  const entryKey=entries.map(x=>`${x.value}:${x.label}`).join("|");
  useLayoutEffect(()=>{const el=listRef.current;if(!el)return;const observer=new ResizeObserver(updateEdges);observer.observe(el);updateEdges();return()=>observer.disconnect();},[query,kind,search,entryKey]);
  const scrollLabel=localizedField("sourcePicker", "scroll")[locale];
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
  const filters = <SourceTypeControl locale={locale} value={kind} onChange={setKind} disabled={disabled} showLabels={ownLabelsEnabled||sharedLabelsEnabled}/>;
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
        {showCollections&&remote.active&&remote.status==='loading'&&<p role="status">{localizedField("sourcePicker", "loading")[locale]}</p>}
        {showCollections&&remote.active&&remote.status==='error'&&<button type="button" onClick={()=>void remote.retry()}>{localizedField("sourcePicker", "retry")[locale]}</button>}
        {labelLoading&&<p role="status">{labelCopy.loading}</p>}
        {ownLabelError&&<button type="button" onClick={()=>void ownLabels.refresh()}>{labelCopy.retry}</button>}
        {sharedLabels.status==='error'&&<button type="button" onClick={()=>void sharedLabels.refresh()}>{labelCopy.retry}</button>}
        {visible.map((x) => {
          const active = x.kind==='label' ? draft.librarySelection?.labelId===x.value :
            !draft.librarySelection?.labelId && (x.kind==='dictionary'
              ? draft.materialMode==="all-dictionaries" ||
                (draft.materialMode==="selected-dictionaries"&&draft.dictionaryIds?.includes(x.value))
              : draft.materialMode==="collection"&&draft.listValue===x.value);
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
                onChange(current=>{
                  const selection=current.librarySelection;
                  const criteria=selection?{query:selection.query,category:selection.category,languageCode:selection.languageCode}:undefined;
                  if(x.kind==='label')return {
                    ...current, materialMode:'all-dictionaries', listValue:'', dictionaryIds:undefined,
                    librarySelection:{query:criteria?.query??'',category:criteria?.category??'headwords',
                      ...(criteria?.languageCode?{languageCode:criteria.languageCode}:{}),labelId:x.value,labelName:x.label},
                  };
                  // A different source keeps independent Library search criteria.
                  const librarySelection=selection?.labelId?(criteria?.query||criteria?.languageCode?criteria:undefined):selection;
                  if(x.kind==='collection')return {...current,materialMode:'collection',listValue:x.value,librarySelection};
                  const ids=current.materialMode==='selected-dictionaries'?current.dictionaryIds??[]:[];
                  return {...current,materialMode:'selected-dictionaries',librarySelection,
                    dictionaryIds:ids.includes(x.value)?ids.filter(id=>id!==x.value):[...ids,x.value]};
                });
              }}
            >
              {x.kind==="dictionary"?<BookOpen size={14}/>:x.kind==="label"?<Folder size={14}/>:x.ownership==="received"?<Share2 size={14}/>:<Layers size={14}/>}
              <span>{x.label}</span>
              <span className={s.sourceMeta}><Check size={14} className={active ? s.checkVisible : s.checkHidden} aria-hidden="true"/><small>{x.kind==="label"?labelCopy.labels:localizedField("sourcePicker", x.kind === "dictionary" ? "dictionarySingular" : x.ownership === "received" ? "sharedSingular" : "collectionSingular")[locale]}</small></span>
            </button>
          );
        })}
        {showCollections&&remote.active&&remote.page.nextCursor&&<button type="button" disabled={remote.more} onClick={()=>void remote.loadMore()}>{localizedField("sourcePicker", "more")[locale]}</button>}
        {!visible.length && !labelLoading && !ownLabelError && sharedLabels.status!=='error' && !(showCollections&&remote.active&&(remote.status==='loading'||remote.status==='error'||remote.page.nextCursor)) && <p className={s.empty}>{labels[4]}</p>}
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
