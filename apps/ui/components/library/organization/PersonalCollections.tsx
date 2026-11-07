"use client";
import { localizedField } from "@/lib/i18n/catalog";

import {CollectionSortControl} from "@/components/library/organization/CollectionSortControl";
import React, { useMemo, useState } from "react";
import { FileText, Folder, Folders, Share2, LockKeyhole, MoreHorizontal, Plus, Search, Tags, X, ChevronDown, ChevronRight } from "lucide-react";
import {readOwnerShareJournal,ownerShareStore} from '@/lib/collections/sharing/ownerShareJournal';
import {OwnedCollectionSharing} from '../sharing/OwnedCollectionSharing';
import { DialogSurface } from "@/components/practice/ui/DialogSurface";
import { ActionMenu } from "@/components/practice/ui/ActionMenu";
import overlays from "@/components/practice/library/libraryOverlays.module.css";
import { type CollectionLabel, type CollectionLabelOperation } from "@/lib/collections/labels/model";
import { createUserList, deleteUserList, updateUserList } from "@/lib/training/listService";
import type { WordListSummary } from "@/lib/types";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { collectionRows, labelRows as projectLabelRows, collectionLabelNames, type CollectionSort } from "@/lib/collections/labels/catalog";
import { organizationCopy } from "./copy";
import { formatUiCount } from "@/lib/uiMessages";
import { usePersonalLabels } from "./usePersonalLabels";
import {usePersonalCollectionCatalog} from './usePersonalCollectionCatalog';
import {ReceivedCollectionLabels} from './ReceivedCollectionLabels';
import {collectionDetailsFromSummary} from "@/lib/collections/details/summaryAdapter";
import {CollectionDetailsPanel,CollectionDetailsSurface} from "./CollectionDetailsPanel";
import s from "./organization.module.css";

type CatalogCollection=WordListSummary&{ownership?:'owned'|'received';isShared?:boolean;labelIds?:string[]};
type Props = {active: boolean; userId: string; language: string; locale: OnboardingLanguage; collections: WordListSummary[]; onReload: () => Promise<void>; onOpen: (collection: WordListSummary) => void; onOpenReceived?: (collection:WordListSummary)=>void; onOpenLabel?: (label:CollectionLabel) => void};
type Editor = {kind:"label"; id:string; existing?:CollectionLabel} | {kind:"collection"; existing?:WordListSummary} | {kind:"assign"; collection:WordListSummary} | {kind:"delete-label"; label:CollectionLabel} | {kind:"delete-collection"; collection:WordListSummary};

export function PersonalCollections({active, userId, language, locale, collections, onReload, onOpen, onOpenReceived, onOpenLabel}: Props) {
  const t = organizationCopy(locale);
  const labels = usePersonalLabels(active,userId);
  const [scope, setScope] = useState("all");
  const [query, setQuery] = useState("");
  const [labelQuery, setLabelQuery] = useState("");
  const [collapsedLabels,setCollapsedLabels]=useState<Set<string>>(new Set());
  const [collapsedSections,setCollapsedSections]=useState<Set<string>>(new Set());
  const [labelSearchOpen,setLabelSearchOpen]=useState(false);
  const [detailsSelection,setDetailsSelection]=useState<{userId:string;id:string}|null>(null);
  const [sort, setSort] = useState<CollectionSort>("recent");
  const [pageSize, setPageSize] = useState(20);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [sharing,setSharing]=useState<{ownerId:string;collection:WordListSummary}|null>(null);
  const dismissedSharing=React.useRef(new Set<string>()),sharingWasActive=React.useRef(false);
  React.useEffect(()=>{
    if(process.env.NEXT_PUBLIC_COLLECTION_SHARING_ENABLED!=='true'||!active){sharingWasActive.current=false;return;}
    if(!sharingWasActive.current){sharingWasActive.current=true;dismissedSharing.current.clear();}
    if(sharing?.ownerId===userId)return;
    const pending=readOwnerShareJournal(ownerShareStore(),userId);
    if(pending&&'collectionId'in pending.command&&!dismissedSharing.current.has(pending.command.operationId)){
      const id=pending.command.collectionId;setSharing({ownerId:userId,collection:collections.find(row=>row.id===id)??{id,name:t.collections,type:'user'}});
    }
  },[active,userId,sharing,collections,t.collections]);
  const closeSharing=()=>{const pending=readOwnerShareJournal(ownerShareStore(),userId);if(pending&&'collectionId'in pending.command&&pending.command.collectionId===sharing?.collection.id)dismissedSharing.current.add(pending.command.operationId);setSharing(null);void catalog.refresh();};
  const [editor, setEditor] = useState<Editor | null>(null);
  const [receivedEditor,setReceivedEditor]=useState<{ownerId:string;collection:CatalogCollection}|null>(null);
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveLock = React.useRef(false);
  const alive = React.useRef(true);
  React.useEffect(() => {alive.current = true; return () => {alive.current = false;};}, []);
  const [menu, setMenu] = useState<{anchor:HTMLButtonElement; label?:CollectionLabel; collection?:CatalogCollection} | null>(null);
  const organizerRoot = React.useRef<HTMLDivElement>(null);
  const editorFocus = React.useRef<HTMLElement | null>(null);
  const wasEditing = React.useRef(false);
  React.useEffect(() => {
    if (editor||receivedEditor) {wasEditing.current = true;return;}
    if (!wasEditing.current) return;
    wasEditing.current = false;
    const opener = editorFocus.current;
    const target = opener?.isConnected && opener !== document.body ? opener : Array.from(organizerRoot.current?.querySelectorAll<HTMLButtonElement>("button") ?? []).find(button => !button.disabled && button.getClientRects().length > 0);
    target?.focus({preventScroll:true});
  },[editor,receivedEditor]);
  const snapshot = labels.snapshot;
  const chosenLabel = snapshot?.labels.find(label => label.id === scope);
  const effectiveScope = scope === "all" || scope === "unlabelled" || chosenLabel ? scope : "all";
  const scopeTitle = effectiveScope === "all" ? t.all : effectiveScope === "unlabelled" ? t.unlabelled : labelRowsForScope(snapshot,locale,chosenLabel!.id);
  const ownRows = useMemo(() => collectionRows(snapshot,collections,effectiveScope,query,sort,locale),[snapshot,collections,effectiveScope,query,sort,locale]);
  const publicationEnabled=process.env.NEXT_PUBLIC_COLLECTION_SHARING_ENABLED==='true';
  const catalog=usePersonalCollectionCatalog({userId,active:active&&publicationEnabled&&Boolean(snapshot),query:{query,sort,scope:effectiveScope==='all'?'all':effectiveScope==='unlabelled'?'unlabelled':'label',labelId:['all','unlabelled'].includes(effectiveScope)?null:effectiveScope,languageCode:language,limit:50}});
  const rows:CatalogCollection[]=publicationEnabled?catalog.collections.map(row=>({id:row.id,name:row.name,description:collections.find(collection=>collection.id===row.id)?.description,type:'user',created_at:row.createdAt,item_count:row.itemCount,ownership:row.ownership,isShared:row.isShared,labelIds:row.labelIds})):ownRows;
  const visibleRows=publicationEnabled?rows:rows.slice(0,pageSize);
  const details=detailsSelection?.userId===userId?rows.find(row=>row.id===detailsSelection.id)??null:null;
  const detailsFocus=React.useRef<HTMLElement|null>(null);
  const setDetails=(row:CatalogCollection|null)=>{if(row)detailsFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setDetailsSelection(row?{userId,id:row.id}:null);if(!row)detailsFocus.current?.focus({preventScroll:true});};
  React.useEffect(()=>{if(!details)return;const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){setDetailsSelection(null);detailsFocus.current?.focus({preventScroll:true});}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[details]);
  const labelRows = useMemo(() => projectLabelRows(snapshot,locale),[snapshot,locale]);
  const namesByCollection = useMemo(() => collectionLabelNames(snapshot),[snapshot]);
  const filteredLabels = labelRows.filter(({label,path})=>labelQuery.trim()?path.toLocaleLowerCase(locale).includes(labelQuery.trim().toLocaleLowerCase(locale)):(()=>{let parent=label.parent_id;while(parent){if(collapsedLabels.has(parent))return false;parent=snapshot?.labels.find(row=>row.id===parent)?.parent_id??null;}return true;})());
  const toggleCollapsed=(setter:React.Dispatch<React.SetStateAction<Set<string>>>,id:string)=>setter(value=>{const next=new Set(value);if(next.has(id))next.delete(id);else next.add(id);return next;});
  const childLabels=labelRows.filter(({label})=>label.parent_id===effectiveScope);
  const assignedIds=(collection:CatalogCollection)=>collection.labelIds??snapshot?.assignments.filter(item=>item.collection_id===collection.id).map(item=>item.label_id)??[];
  const belongsTo=(collection:CatalogCollection,id:string)=>assignedIds(collection).some(labelId=>{let next:string|null=labelId;while(next){if(next===id)return true;next=snapshot?.labels.find(row=>row.id===next)?.parent_id??null;}return false;});
  const sections=childLabels.length?childLabels.map(({label})=>({id:label.id,name:label.name,rows:visibleRows.filter(collection=>childLabels.find(child=>belongsTo(collection,child.label.id))?.label.id===label.id)})):[];
  const ungroupedRows=childLabels.length?visibleRows.filter(collection=>!childLabels.some(child=>belongsTo(collection,child.label.id))):visibleRows;
  const renderCollection=(collection:CatalogCollection)=>{
    const names=publicationEnabled?(collection.labelIds??[]).map(id=>snapshot?.labels.find(label=>label.id===id)?.name).filter((name):name is string=>Boolean(name)):namesByCollection.get(collection.id)??[];
    const open=()=>collection.ownership==='received'?onOpenReceived?.(collection):onOpen(collection);
    return <PersonalCollectionRow key={collection.id} collection={collection} names={names} locale={locale} onOpen={open} onDetails={()=>setDetails(collection)} onMore={event=>setMenu({anchor:event.currentTarget,collection})}/>;
  };
  const changeScope = (id:string) => {setScope(id);setPageSize(20);setScopeOpen(false);};
  const begin = (next:Editor) => {
    editorFocus.current = menu?.anchor ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setMenu(null); setScopeOpen(false);setSaveError(null);
    setName(next.kind === "label" ? next.existing?.name ?? "" : next.kind === "collection" ? next.existing?.name ?? "" : "");
    setParent(next.kind === "label" ? next.existing ? next.existing.parent_id ?? "" : chosenLabel?.id ?? "" : "");
    setSelected(next.kind === "assign" ? snapshot?.assignments.filter(item=>item.collection_id===next.collection.id).map(item=>item.label_id) ?? [] : []);
    setEditor(next);
  };
  const hasSelectedDescendant=(id:string)=>selected.some(selectedId=>{let next=snapshot?.labels.find(row=>row.id===selectedId)?.parent_id;while(next){if(next===id)return true;next=snapshot?.labels.find(row=>row.id===next)?.parent_id;}return false;});
  const closeEditor = () => {if (!saveLock.current) setEditor(null);};
  const submit = async (event:React.FormEvent) => {
    event.preventDefault(); if (!editor || saveLock.current) return;
    saveLock.current = true;setSaving(true);setSaveError(null);
    try {
      let operation:CollectionLabelOperation | null = null;
      if (editor.kind === "label") operation = editor.existing ? {type:"update",id:editor.id,name:name.trim(),parent_id:parent || null} : {type:"create",id:editor.id,name:name.trim(),parent_id:parent || null};
      if (editor.kind === "assign") operation = {type:"set-collection-labels",collection_id:editor.collection.id,label_ids:selected};
      if (editor.kind === "delete-label") operation = {type:"delete",id:editor.label.id};
      if (operation) { if (!await labels.mutate(operation)) return; }
      else {
        if (editor.kind === "collection") {
          const result = editor.existing ? await updateUserList({userId,listId:editor.existing.id,name:name.trim()}) : await createUserList({userId,name:name.trim(),language_code:language});
          if (!result) {if(alive.current) setSaveError("uncertain");return;}
        } else if (editor.kind === "delete-collection") {
          const result = await deleteUserList(editor.collection.id);
          if (result.error) {if(alive.current) setSaveError("failed");return;}
        }
        await onReload();
        await labels.refresh();
      }
      if(publicationEnabled)await catalog.refresh();
      if(alive.current) {setEditor(null);if(editor.kind === "collection" && !editor.existing) changeScope("all");}
    } catch {if(alive.current) setSaveError("uncertain");}
    finally {saveLock.current = false;if(alive.current) setSaving(false);}
  };
  const message = (code:string) => code === "conflict" ? t.conflict : code === "uncertain" ? t.uncertain : code === "unavailable" ? t.unavailable : ["failed","invalid","missing"].includes(code) ? t.failed : t.error;
  const scopePicker = <div className={s.labelPanel}>
    <header><h2>{t.labels}</h2><div className={s.headerActions}><button type="button" aria-label={t.searchLabels} aria-expanded={labelSearchOpen} onClick={()=>{setLabelSearchOpen(value=>!value);setLabelQuery("");}}><Search size={18}/></button><button type="button" aria-label={t.newLabel} onClick={()=>begin({kind:"label",id:crypto.randomUUID()})}><Plus size={18}/></button></div></header>
    {labelSearchOpen&&<label className={s.search}><Search size={16}/><input autoFocus aria-label={t.searchLabels} placeholder={t.searchLabels} value={labelQuery} onChange={event=>setLabelQuery(event.target.value)}/></label>}
    <div className={s.labelList}>
      <button type="button" aria-pressed={effectiveScope === "all"} onClick={()=>changeScope("all")}><Folders size={18}/><span>{t.all}</span></button>
      <button type="button" aria-pressed={effectiveScope === "unlabelled"} onClick={()=>changeScope("unlabelled")}><FileText size={18}/><span>{t.unlabelled}</span></button>
      {filteredLabels.map(({label,depth,path,parents})=><div className={s.labelRow} key={label.id} style={{paddingInlineStart:Math.min(depth,4)*12}}>
        {snapshot?.labels.some(row=>row.parent_id===label.id)&&<button className={s.treeDisclosure} type="button" aria-label={label.name} aria-expanded={!collapsedLabels.has(label.id)} onClick={()=>toggleCollapsed(setCollapsedLabels,label.id)}>{collapsedLabels.has(label.id)?<ChevronRight size={14}/>:<ChevronDown size={14}/>}</button>}
        <button type="button" aria-pressed={effectiveScope === label.id} title={path} onClick={()=>changeScope(label.id)}><Folder size={18}/><span>{label.name}{labelQuery.trim() && parents ? ` · ${parents}` : ""}</span></button>
        <button type="button" aria-label={`${t.more}: ${label.name}`} onClick={event=>setMenu({anchor:event.currentTarget,label})}><MoreHorizontal size={18}/></button>
      </div>)}
      {!labelRows.length && <p className={s.muted}>{t.noLabels}</p>}
    </div>
  </div>;
  if (!snapshot) return <div className={s.state} role={labels.error ? "alert" : "status"}>{labels.error ? message(labels.error) : t.loading}{labels.error && <button onClick={()=>void labels.refresh()}>{t.retry}</button>}</div>;
  return <div ref={organizerRoot} className={`${s.organizer} ${details?s.withDetails:""}`} data-testid="personal-collections">
    <aside className={s.sidebar}>{scopePicker}</aside>
    <section className={s.catalog} aria-label={t.collections}>
      <header className={s.catalogHeader}><button type="button" className={s.mobileScope} onClick={()=>setScopeOpen(true)}><Folder size={18}/><span>{scopeTitle}</span><ChevronDown size={16}/></button><h2>{scopeTitle}</h2><button type="button" aria-label={t.newCollection} onClick={()=>begin({kind:"collection"})}><Plus size={18}/><span>{t.newCollection}</span></button></header>
      <div className={s.filters}><label className={s.search}><Search size={16} aria-hidden="true"/><input aria-label={t.search} placeholder={t.search} maxLength={200} value={query} onChange={event=>{setQuery(Array.from(event.target.value).slice(0,100).join(''));setPageSize(20);}}/></label><CollectionSortControl locale={locale} value={sort} onChange={value=>{setSort(value);setPageSize(20);}}/></div>
      {labels.error && !editor && <p role="alert">{message(labels.error)} <button onClick={()=>void labels.refresh()} disabled={labels.busy}>{t.retry}</button></p>}
      {publicationEnabled&&catalog.status==='error'&&<p role="alert">{t.unavailable} <button onClick={()=>void catalog.refresh()}>{t.retry}</button></p>}
      <div className={s.results} aria-busy={labels.loading||publicationEnabled&&catalog.status==='loading'}>
        {publicationEnabled&&catalog.status==='loading'?<p role="status">{t.loading}</p>:!rows.length&&(!publicationEnabled||catalog.status==='ready')&&<p className={s.state}>{query.trim()||effectiveScope!=='all'?t.noResults:t.empty}</p>}
        {sections.map(section=><section key={section.id} className={s.collectionSection}><button className={s.sectionHeading} type="button" aria-expanded={!collapsedSections.has(section.id)} onClick={()=>toggleCollapsed(setCollapsedSections,section.id)}>{collapsedSections.has(section.id)?<ChevronRight size={16}/>:<ChevronDown size={16}/>}<Folder size={18}/><span>{section.name}</span></button>{!collapsedSections.has(section.id)&&section.rows.map(renderCollection)}</section>)}
        {ungroupedRows.map(renderCollection)}
        {publicationEnabled?catalog.nextCursor&&<button className={s.loadMore} disabled={catalog.loadingMore} onClick={()=>void catalog.loadMore()}>{catalog.loadingMore?t.loading:t.moreResults}</button>:rows.length>pageSize&&<button className={s.loadMore} onClick={()=>setPageSize(value=>value+20)}>{t.moreResults} · {Math.min(pageSize,rows.length)} / {rows.length}</button>}
      </div>
    </section>
    {details&&<CollectionDetailsSurface name={details.name} onClose={()=>setDetails(null)}><CollectionDetailsPanel details={withPreviewSource(collectionDetailsFromSummary(details,{canEditLabels:details.ownership==='owned'||details.ownership==='received'||!publicationEnabled}))} labelNames={details.labelIds?.map(id=>labelRows.find(row=>row.label.id===id)?.path).filter((name):name is string=>Boolean(name))??(snapshot.assignments.filter(item=>item.collection_id===details.id).map(item=>labelRows.find(row=>row.label.id===item.label_id)?.path).filter((path):path is string=>Boolean(path)))} locale={locale} isShared={details.isShared===true} onClose={()=>setDetails(null)} onLabels={()=>{setDetails(null);if(details.ownership==='received')setReceivedEditor({ownerId:userId,collection:details});else begin({kind:"assign",collection:details});}} onOpen={()=>{setDetails(null);if(details.ownership==='received')onOpenReceived?.(details);else onOpen(details);}}/></CollectionDetailsSurface>}
    {scopeOpen && <DialogSurface className={overlays.dialog} aria-label={t.chooseScope} onDismiss={()=>setScopeOpen(false)}><div className={s.scopeDialog}><button className={s.dismiss} aria-label={t.close} onClick={()=>setScopeOpen(false)}><X size={20}/></button>{scopePicker}</div></DialogSurface>}
    {menu && <ActionMenu anchor={menu.anchor} title={t.more} language={locale} onClose={()=>setMenu(null)} items={menu.label ? [
      ...(onOpenLabel ? [{id:"open",label:t.open,onSelect:()=>{onOpenLabel(menu.label!);setMenu(null);}}] : []),
      {id:"edit",label:t.editLabel,onSelect:()=>begin({kind:"label",id:menu.label!.id,existing:menu.label})},
      {id:"child",label:t.newLabel,onSelect:()=>{begin({kind:"label",id:crypto.randomUUID()});setParent(menu.label!.id);}},
      {id:"delete",label:t.remove,onSelect:()=>begin({kind:"delete-label",label:menu.label!})},
    ] : menu.collection?.ownership==='received'?[
      {id:'open',label:t.open,onSelect:()=>{onOpenReceived?.(menu.collection!);setMenu(null);}},
      {id:'labels',label:t.assign,icon:<Tags size={16}/>,onSelect:()=>{editorFocus.current=menu.anchor;setReceivedEditor({ownerId:userId,collection:menu.collection!});setMenu(null);}},
    ] : menu.collection ? ownedCollectionMenuItems({locale,sharingEnabled:process.env.NEXT_PUBLIC_COLLECTION_SHARING_ENABLED==='true',
      onOpen:()=>{onOpen(menu.collection!);setMenu(null);},onLabels:()=>begin({kind:"assign",collection:menu.collection!}),
      onShare:()=>{menu.anchor.focus({preventScroll:true});setSharing({ownerId:userId,collection:menu.collection!});setMenu(null);},
      onRename:()=>begin({kind:"collection",existing:menu.collection}),onDelete:()=>begin({kind:"delete-collection",collection:menu.collection!})}) : []}/>}
    {sharing?.ownerId===userId&&<OwnedCollectionSharing key={`${userId}:${sharing.collection.id}`} userId={userId} collectionId={sharing.collection.id} name={sharing.collection.name} locale={locale} onClose={closeSharing}/>}
    {receivedEditor?.ownerId===userId&&<ReceivedCollectionLabels key={`${userId}:${receivedEditor.collection.id}`} userId={userId} collectionId={receivedEditor.collection.id} name={receivedEditor.collection.name} locale={locale} onClose={()=>setReceivedEditor(null)} onSaved={()=>{setReceivedEditor(null);void catalog.refresh();void labels.refresh();}}/>}
    {editor && <DialogSurface className={overlays.dialog} aria-labelledby="organization-dialog-title" onDismiss={closeEditor}>
      <form className={s.editor} onSubmit={submit}>
        <header><h2 id="organization-dialog-title">{editor.kind === "label" ? editor.existing ? t.editLabel : t.newLabel : editor.kind === "collection" ? editor.existing ? t.editCollection : t.newCollection : editor.kind === "assign" ? t.assign : t.remove}</h2><button type="button" disabled={saving} aria-label={t.close} onClick={closeEditor}><X size={20}/></button></header>
        {(editor.kind === "label" || editor.kind === "collection") && <label>{t.name}<input required autoFocus maxLength={100} value={name} onChange={event=>setName(event.target.value)} disabled={saving}/></label>}
        {editor.kind === "label" && <label>{t.parent}<select value={parent} onChange={event=>setParent(event.target.value)} disabled={saving}><option value="">{t.noParent}</option>{labelRows.filter(({label})=>label.id!==editor.id).map(({label,depth})=><option key={label.id} value={label.id}>{"— ".repeat(depth)}{label.name}</option>)}</select></label>}
        {editor.kind === "assign" && <><p>{editor.collection.name}</p><div className={s.assignmentList}>{labelRows.map(({label,depth})=><label key={label.id} style={{paddingInlineStart:depth*12}}><input type="checkbox" ref={input=>{if(input)input.indeterminate=!selected.includes(label.id)&&hasSelectedDescendant(label.id);}} aria-checked={!selected.includes(label.id)&&hasSelectedDescendant(label.id)?"mixed":selected.includes(label.id)} checked={selected.includes(label.id)} disabled={saving} onChange={()=>setSelected(value=>value.includes(label.id)?value.filter(id=>id!==label.id):[...value,label.id])}/><Folder size={16}/>{label.name}</label>)}{!labelRows.length && <p>{t.noLabels}</p>}</div></>}
        {(editor.kind === "delete-label" || editor.kind === "delete-collection") && <><p>{editor.kind === "delete-label" ? editor.label.name : editor.collection.name}</p><p>{editor.kind === "delete-label" ? t.deleteLabel : t.deleteCollection}</p></>}
        {(saveError || labels.error) && <p role="alert">{message(saveError ?? labels.error!)}{saveError === "uncertain" && <button type="button" onClick={()=>{void onReload();void labels.refresh();}}>{t.retry}</button>}</p>}
        <footer><button type="button" disabled={saving} onClick={closeEditor}>{t.cancel}</button><button type="submit" disabled={saving || saveError === "uncertain" || ((editor.kind === "label" || editor.kind === "collection") && !name.trim())}>{saving ? t.saving : editor.kind.startsWith("delete") ? t.remove : t.save}</button></footer>
      </form>
    </DialogSurface>}
  </div>;
}

/** Shared collection row: the catalog and guided preview use identical controls. */
export function PersonalCollectionRow({collection,names=[],locale,onOpen,onDetails,onMore}:{collection:CatalogCollection;names?:string[];locale:OnboardingLanguage;onOpen:()=>void;onDetails?:()=>void;onMore:React.MouseEventHandler<HTMLButtonElement>}) {
 const t=organizationCopy(locale);
 return <article className={s.collection}>
  <span className={s.accessIcon} title={collection.isShared?t.shared:t.private}>{collection.isShared?<Share2 size={16}/>:<LockKeyhole size={16}/>}</span><div className={s.collectionCopy}><button className={s.collectionName} onClick={onDetails??onOpen}>{collection.name}</button><p>{formatUiCount(locale,collection.item_count??0,t,"meaning")}{names.length?` · ${names.join(" / ")}`:""}</p></div>
  <button className={s.viewWords} onClick={onOpen}>{t.open}</button><button data-onboarding="own-collection-menu" aria-label={`${t.more}: ${collection.name}`} onClick={onMore}><MoreHorizontal size={18}/></button>
 </article>;
}

export function ownedCollectionMenuItems(p:{locale:OnboardingLanguage;sharingEnabled:boolean;onOpen:()=>void;onLabels:()=>void;onShare:()=>void;onRename:()=>void;onDelete:()=>void}) {
 const t=organizationCopy(p.locale);
 return [{id:"open",label:t.open,onSelect:p.onOpen},{id:"labels",label:t.assign,icon:<Tags size={16}/>,onSelect:p.onLabels},
 ...(p.sharingEnabled?[{id:"share",label:localizedField("personalCollections", "share")[p.locale],icon:<Share2 size={16}/>,onSelect:p.onShare}]:[]),
 {id:"rename",label:t.rename,onSelect:p.onRename},{id:"delete",label:t.remove,onSelect:p.onDelete}];
}

function labelRowsForScope(snapshot:import("@/lib/collections/labels/model").CollectionLabelsSnapshot|null,locale:string,id:string){return projectLabelRows(snapshot,locale).find(row=>row.label.id===id)?.path??"";}
function withPreviewSource(details:import("@/lib/collections/details/model").CollectionDetails):import("@/lib/collections/details/model").CollectionDetails{
 if(process.env.NODE_ENV!=="development"||process.env.NEXT_PUBLIC_COLLECTION_DETAILS_PREVIEW!=="true"||details.id!=="10900000-0000-4000-8000-000000000011")return details;
 return {...details,persistence:"preview",sourceStatus:"available",source:{materialKind:"video",originKind:"youtube",materialTitle:details.name,creatorName:"Lubach",url:"https://www.youtube.com/",fileName:null,publishedOn:"2026-10-16"}};
}
