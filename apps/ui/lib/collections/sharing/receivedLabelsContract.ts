import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import {parseLabelsSnapshot,type CollectionLabelsSnapshot} from '@/lib/collections/labels/model';
export type ReceivedLabelState={collectionId:string;catalog:CollectionLabelsSnapshot;labelIds:string[]};
export type ReceivedLabelMutation={expectedRevision:number;labelIds:string[]};
export type ReceivedLabelResult={collectionId:string;revision:number;labelIds:string[]};
const record=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
const revision=(v:unknown):v is number=>Number.isInteger(v)&&Number(v)>=0&&Number(v)<=2147483646;
const ids=(v:unknown):v is string[]=>Array.isArray(v)&&v.length<=1000&&v.every(copyUuid)&&new Set(v.map(id=>id.toLowerCase())).size===v.length;
export function parseReceivedLabelMutation(value:unknown):ReceivedLabelMutation|null{
 return record(value)&&exact(value,['expectedRevision','labelIds'])&&revision(value.expectedRevision)&&ids(value.labelIds)?{expectedRevision:value.expectedRevision,labelIds:value.labelIds.map(id=>id.toLowerCase()).sort()}:null;
}
export function parseReceivedLabelState(value:unknown,id:string):ReceivedLabelState|null{
 if(!record(value)||!exact(value,['collectionId','catalog','labelIds'])||value.collectionId!==id||!ids(value.labelIds))return null;
 const catalog=parseLabelsSnapshot(value.catalog),labelIds=value.labelIds.map(id=>id.toLowerCase());
 return catalog&&labelIds.every(id=>catalog.labels.some(label=>label.id===id))?{collectionId:id,catalog,labelIds}:null;
}
export function parseReceivedLabelResult(value:unknown,id:string):ReceivedLabelResult|null{
 return record(value)&&exact(value,['collectionId','revision','labelIds'])&&value.collectionId===id&&revision(value.revision)&&ids(value.labelIds)?{collectionId:id,revision:value.revision,labelIds:value.labelIds.map(id=>id.toLowerCase()).sort()}:null;
}
export function matchesReceivedLabelMutation(result:ReceivedLabelResult,input:ReceivedLabelMutation){
 return result.revision>=input.expectedRevision&&result.revision<=input.expectedRevision+1&&JSON.stringify(result.labelIds)===JSON.stringify([...input.labelIds].sort());
}
