import type {WordListSummary} from "@/lib/types";
import {collectionsForLabel,type CollectionLabel,type CollectionLabelsSnapshot} from "./model";
export type CollectionSort = "recent" | "name" | "count";
export function labelRows(snapshot:CollectionLabelsSnapshot|null,locale:string) {
  const children=new Map<string|null,CollectionLabel[]>();
  for(const label of snapshot?.labels ?? []) children.set(label.parent_id,[...(children.get(label.parent_id) ?? []),label]);
  const rows:Array<{label:CollectionLabel;depth:number;path:string;parents:string}>=[];
  const walk=(id:string|null,names:string[])=>{
    const sorted=(children.get(id) ?? []).sort((a,b)=>a.name.localeCompare(b.name,locale)||a.id.localeCompare(b.id));
    for(const label of sorted){const path=[...names,label.name];rows.push({label,depth:names.length,path:path.join(" / "),parents:names.join(" / ")});walk(label.id,path);}
  };
  walk(null,[]);return rows;
}
/** Project the complete bounded own catalog before the UI renders a page. */
export function collectionRows(snapshot:CollectionLabelsSnapshot|null,collections:WordListSummary[],scope:string,query:string,sort:CollectionSort,locale:string) {
  if(!snapshot)return [];
  const assigned=new Set(snapshot.assignments.map(item=>item.collection_id));
  const included=new Set(collectionsForLabel(snapshot,scope));
  const normalized=query.trim().toLocaleLowerCase(locale);
  return [...new Map(collections.map(item=>[item.id,item])).values()]
    .filter(item=>(scope==="all" || (scope==="unlabelled" ? !assigned.has(item.id):included.has(item.id))) && item.name.toLocaleLowerCase(locale).includes(normalized))
    .sort((a,b)=>sort==="name" ? a.name.localeCompare(b.name,locale)||a.id.localeCompare(b.id):sort==="count" ? (b.item_count ?? 0)-(a.item_count ?? 0)||a.id.localeCompare(b.id):(b.created_at ?? "").localeCompare(a.created_at ?? "")||a.id.localeCompare(b.id));
}
export function collectionLabelNames(snapshot:CollectionLabelsSnapshot|null) {
  const labels=new Map(snapshot?.labels.map(label=>[label.id,label.name]));
  const names=new Map<string,string[]>();
  for(const assignment of snapshot?.assignments ?? []){
    const name=labels.get(assignment.label_id);if(name)names.set(assignment.collection_id,[...(names.get(assignment.collection_id) ?? []),name]);
  }
  return names;
}
