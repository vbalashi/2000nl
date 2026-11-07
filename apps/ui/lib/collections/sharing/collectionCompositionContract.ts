import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
export type CollectionCompositionOperation={action:'add';entryId:string}|{action:'remove';entryIds:string[]}|{action:'delete'};
const object=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,fields:string[])=>Object.keys(v).length===fields.length&&Object.keys(v).every(key=>fields.includes(key));
export function parseCollectionCompositionOperation(v:unknown):CollectionCompositionOperation|null{
 if(!object(v))return null;
 if(v.action==='delete'&&keys(v,['action']))return {action:'delete'};
 if(v.action==='add'&&keys(v,['action','entryId'])&&copyUuid(v.entryId))return {action:'add',entryId:v.entryId.toLowerCase()};
 if(v.action==='remove'&&keys(v,['action','entryIds'])&&Array.isArray(v.entryIds)&&v.entryIds.length>=1&&v.entryIds.length<=500&&v.entryIds.every(copyUuid))return {action:'remove',entryIds:[...new Set(v.entryIds.map(id=>id.toLowerCase()))].sort()};
 return null;
}
export type CollectionCompositionReceipt={planId:string;collectionId:string;status:'committed'};
export function parseCollectionCompositionReceipt(v:unknown,planId:string):CollectionCompositionReceipt|null{
 return object(v)&&keys(v,['planId','collectionId','status'])&&v.planId===planId&&copyUuid(v.collectionId)&&v.status==='committed'?v as CollectionCompositionReceipt:null;
}
export type CollectionCompositionPlan={planId:string;collectionId:string;action:CollectionCompositionOperation['action'];audience:Array<{userId:string;paths:Array<{rootId:string;kind:'collection'|'label';lifetime:string}>}>};
export function parseCollectionCompositionPlan(v:unknown,collectionId:string,action:CollectionCompositionOperation['action']):CollectionCompositionPlan|null{
 if(!object(v)||!keys(v,['planId','collectionId','action','audience'])||!copyUuid(v.planId)||v.collectionId!==collectionId||v.action!==action||!Array.isArray(v.audience))return null;
 const users=new Set<string>();
 for(const recipient of v.audience){
  if(!object(recipient)||!keys(recipient,['userId','paths'])||!copyUuid(recipient.userId)||users.has(recipient.userId)||!Array.isArray(recipient.paths)||!recipient.paths.length)return null;
  users.add(recipient.userId);const paths=new Set<string>();
  for(const path of recipient.paths){
   if(!object(path)||!keys(path,['rootId','kind','lifetime'])||!copyUuid(path.rootId)||!copyUuid(path.lifetime)||!['collection','label'].includes(String(path.kind)))return null;
   const id=`${path.kind}:${path.rootId}`;if(paths.has(id))return null;paths.add(id);
  }
 }
 return v as CollectionCompositionPlan;
}
export type CollectionCompositionPlanState=CollectionCompositionReceipt|{planId:string;status:'pending'|'expired'|'unknown'};
export function parseCollectionCompositionPlanState(v:unknown,planId:string):CollectionCompositionPlanState|null{
 const committed=parseCollectionCompositionReceipt(v,planId);if(committed)return committed;
 return object(v)&&keys(v,['planId','status'])&&v.planId===planId&&['pending','expired','unknown'].includes(String(v.status))?v as CollectionCompositionPlanState:null;
}
