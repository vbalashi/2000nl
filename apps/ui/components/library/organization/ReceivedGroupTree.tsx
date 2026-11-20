'use client';
import React,{useMemo,useState} from 'react';
import {ChevronDown,ChevronRight,Folder} from 'lucide-react';
import type {ReceivedGroupTree as GroupTree} from '@/lib/collections/sharing/personalCatalogContract';
import s from './organization.module.css';

export function ReceivedGroupTree<Row extends {id:string}>({tree,rootId,rows,locale,renderCollection}:{
 tree:GroupTree;rootId:string;rows:Row[];locale:string;renderCollection:(row:Row)=>React.ReactNode;
}){
 const [collapsed,setCollapsed]=useState<Set<string>>(()=>new Set());
 const {children,collections}=useMemo(()=>{
  const children=new Map<string,GroupTree['labels']>();
  const collections=new Map<string,Row[]>();
  for(const label of tree.labels){
   if(!label.parentId)continue;
   const siblings=children.get(label.parentId)??[];
   siblings.push(label);children.set(label.parentId,siblings);
  }
  for(const siblings of children.values()){
   siblings.sort((a,b)=>a.name.localeCompare(b.name,locale)||a.id.localeCompare(b.id));
  }
  for(const row of rows){
   for(const labelId of tree.placements[row.id]??[]){
    const assigned=collections.get(labelId)??[];
    assigned.push(row);collections.set(labelId,assigned);
   }
  }
  return {children,collections};
 },[tree,rows,locale]);
 const toggle=(id:string)=>setCollapsed(previous=>{
  const next=new Set(previous);
  if(next.has(id))next.delete(id);else next.add(id);
  return next;
 });
 function renderBranches(parentId:string,depth:number){
  return children.get(parentId)?.map(label=>{
   const open=!collapsed.has(label.id);
   return <section key={label.id} className={s.collectionSection} style={depth>0&&depth<=4?{paddingInlineStart:12}:undefined}>
    <button className={s.sectionHeading} type="button" aria-expanded={open} onClick={()=>toggle(label.id)}>
     {open?<ChevronDown size={16} aria-hidden="true"/>:<ChevronRight size={16} aria-hidden="true"/>}
     <Folder size={18} aria-hidden="true"/><span>{label.name}</span>
    </button>
    {open&&<>{collections.get(label.id)?.map(renderCollection)}{renderBranches(label.id,depth+1)}</>}
   </section>;
  });
 }
 return <>{renderBranches(rootId,0)}{collections.get(rootId)?.map(renderCollection)}</>;
}
