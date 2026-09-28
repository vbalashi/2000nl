"use client";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Search, Plus, Check, Flag, EyeOff } from "lucide-react";
import s from "./libraryOverlays.module.css";
export function CardActionMenu({ anchor, onClose, onAction }: { anchor: HTMLButtonElement; onClose: () => void; onAction: (action: "report" | "known" | "excluded") => void }) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{top:number;left:number}|null>(null);
  useEffect(() => {
    const r=anchor.getBoundingClientRect();
    setPosition({left:Math.max(12,Math.min(r.right-210,window.innerWidth-222)),top:r.bottom+8+148<window.innerHeight?r.bottom+8:Math.max(12,r.top-156)});
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const outside=(e:PointerEvent)=>{if(!menu.current?.contains(e.target as Node)&&!anchor.contains(e.target as Node))onClose();};
    const dismiss=()=>onClose();document.addEventListener('pointerdown',outside);window.addEventListener('resize',dismiss);window.addEventListener('scroll',dismiss,true);
    return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',dismiss);window.removeEventListener('scroll',dismiss,true);};
  },[anchor,onClose]);
  useEffect(()=>{if(position)menu.current?.querySelector<HTMLButtonElement>("button")?.focus();},[position]);
  return createPortal(<div ref={menu} role="menu" aria-label="Card actions" className={s.menu} style={{top:position?.top,left:position?.left,visibility:position?'visible':'hidden'}} onKeyDown={e=>{
    const buttons=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')];const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
    if(e.key==='Escape'||e.key==='Tab'){if(e.key==='Escape')e.preventDefault();onClose();}
    if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}
  }}>{([['report','Report',Flag],['known','Mark as known',Check],['excluded','Exclude',EyeOff]] as const).map(([action,label,Icon])=><button role="menuitem" key={action} onClick={()=>onAction(action)}><Icon size={15}/>{label}</button>)}</div>,document.body);
}
export function LibraryModal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close();},[]);
 return createPortal(<dialog ref={ref} aria-label={title} className={s.dialog} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className={s.sheet}><header><h2>{title}</h2><button aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}><X size={18}/></button></header>{children}</div></dialog>,document.body);
}
export type DemoCollection={id:string;name:string;count:number};
export const initialCollections:DemoCollection[]=[{id:'everyday',name:'Everyday Dutch',count:42},{id:'work',name:'At work',count:28},{id:'travel',name:'Travel',count:16},{id:'expressions',name:'Useful expressions',count:35},{id:'difficult',name:'Difficult words',count:21}];
export function CollectionPicker({catalog,selected,onToggle,onCreate,onClose}:{catalog:DemoCollection[];selected:string[];onToggle:(id:string)=>void;onCreate:(name:string)=>void;onClose:()=>void}){
 const [query,setQuery]=useState('');const [creating,setCreating]=useState(false);const [name,setName]=useState('');
 const matches=catalog.filter(c=>c.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 const duplicate=catalog.some(c=>c.name.toLocaleLowerCase()===name.trim().toLocaleLowerCase());
 return <LibraryModal title="Collections" onClose={onClose}><p className={s.hint}>Choose where to keep this card.</p><label className={s.search}><Search size={16}/><input aria-label="Find a collection" placeholder="Find a collection…" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className={s.collectionList}>{matches.map(c=><label key={c.id} className={s.collectionRow}><input type="checkbox" checked={selected.includes(c.id)} onChange={()=>onToggle(c.id)}/><span>{c.name}</span><small>{c.count} {c.count===1?"card":"cards"}</small></label>)}{!matches.length&&<p className={s.hint}>No matching collections</p>}</div>{creating?<form className={s.createRow} onSubmit={e=>{e.preventDefault();if(!name.trim()||duplicate)return;onCreate(name.trim());setName('');setQuery('');setCreating(false);}}><input autoFocus aria-label="Collection name" placeholder="Collection name" value={name} onChange={e=>setName(e.target.value)}/><button disabled={!name.trim()||duplicate}>Create & add</button>{duplicate&&<small>A collection with this name already exists.</small>}</form>:<button className={s.create} onClick={()=>{setName(query);setCreating(true);}}><Plus size={15}/>New collection</button>}<footer><span>{selected.length} selected · local demo</span><button onClick={onClose}>Done</button></footer></LibraryModal>;
}

type CollectionsStore={catalog:DemoCollection[];memberships:Record<string,string[]>;create:(name:string)=>string;toggle:(cardId:string,id:string)=>void;add:(cardId:string,id:string)=>void};
const CollectionsContext=createContext<CollectionsStore>({catalog:initialCollections,memberships:{},create:()=>"",toggle:()=>{},add:()=>{}});
export function DemoCollectionsProvider({children}:{children:React.ReactNode}){
 const [catalog,setCatalog]=useState(initialCollections);
 const [memberships,setMemberships]=useState<Record<string,string[]>>({});
 function create(name:string){const id=crypto.randomUUID();setCatalog(items=>[...items,{id,name,count:0}]);return id;}
 function add(cardId:string,id:string){setMemberships(current=>({...current,[cardId]:[...new Set([...(current[cardId]||[]),id])]}));}
 function toggle(cardId:string,id:string){setMemberships(current=>{const ids=current[cardId]||[];return {...current,[cardId]:ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]};});}
 const counts=catalog.map(c=>({...c,count:c.count+Object.values(memberships).filter(ids=>ids.includes(c.id)).length}));
 return <CollectionsContext.Provider value={{catalog:counts,memberships,create,toggle,add}}>{children}</CollectionsContext.Provider>;
}
export const useCollections=()=>useContext(CollectionsContext);
