import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import {isCanonicalShareCode} from './shareCode';
export type LabelShareState={labelId:string;isOpen:boolean;revision:number;invitationCode:string|null;subscriberCount:number};
export type LabelSharePreview={labelId:string;name:string;collectionCount:number;alreadyAdded:boolean;role:'owner'|'viewer'|null};
const record=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,k:string[])=>Object.keys(v).length===k.length&&Object.keys(v).every(x=>k.includes(x));
const count=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0;
export function parseLabelShareState(v:unknown):LabelShareState|null{
 if(!record(v)||!keys(v,['labelId','isOpen','revision','invitationCode','subscriberCount'])||!copyUuid(v.labelId)||typeof v.isOpen!=='boolean'||!count(v.revision)||v.revision>2147483646||!count(v.subscriberCount)||(v.isOpen?!isCanonicalShareCode(v.invitationCode):v.invitationCode!==null))return null;
 return v as LabelShareState;
}
export function parseLabelSharePreview(v:unknown):LabelSharePreview|null{
 if(!record(v)||!keys(v,['labelId','name','collectionCount','alreadyAdded','role'])||!copyUuid(v.labelId)||typeof v.name!=='string'||!v.name.trim()||[...v.name].length>100||v.name.includes('\0')||!count(v.collectionCount)||typeof v.alreadyAdded!=='boolean'||![null,'owner','viewer'].includes(v.role as string|null)||v.alreadyAdded!==(v.role!==null))return null;
 return v as LabelSharePreview;
}
export type LabelSharingCatalog={owned:Array<{labelId:string;name:string;isOpen:boolean;revision:number;collectionCount:number}>;received:Array<{labelId:string;name:string;collectionCount:number}>};
export function parseLabelSharingCatalog(v:unknown):LabelSharingCatalog|null{
 if(!record(v)||!keys(v,['owned','received'])||!Array.isArray(v.owned)||!Array.isArray(v.received)||v.owned.length>1000)return null;
 for(const [kind,rows] of [['owned',v.owned],['received',v.received]] as const){
  const seen=new Set<string>();
  for(const row of rows){
   if(!record(row)||!keys(row,kind==='owned'?['labelId','name','isOpen','revision','collectionCount']:['labelId','name','collectionCount'])||!copyUuid(row.labelId)||typeof row.name!=='string'||!row.name.trim()||[...row.name].length>100||row.name.includes('\0')||!count(row.collectionCount)||seen.has(row.labelId.toLowerCase())||kind==='owned'&&(typeof row.isOpen!=='boolean'||!count(row.revision)||row.revision>2147483646))return null;
   seen.add(row.labelId.toLowerCase());
  }
 }
 return v as LabelSharingCatalog;
}
export type LabelShareCommand=
 |{operationId:string;action:'open'|'rotate'|'close';labelId:string;expectedRevision:number}
 |{operationId:string;action:'accept';code:string}
 |{operationId:string;action:'unsubscribe';labelId:string};
export function parseLabelShareCommand(v:unknown):LabelShareCommand|null{
 if(!record(v)||!copyUuid(v.operationId))return null;
 const operationId=v.operationId.toLowerCase();
 if(v.action==='accept'&&keys(v,['operationId','action','code'])&&isCanonicalShareCode(v.code))return {operationId,action:'accept',code:v.code};
 if(!copyUuid(v.labelId))return null;
 const labelId=v.labelId.toLowerCase();
 if(v.action==='unsubscribe'&&keys(v,['operationId','action','labelId']))return {operationId,action:'unsubscribe',labelId};
 if(typeof v.action==='string'&&['open','rotate','close'].includes(v.action)&&keys(v,['operationId','action','labelId','expectedRevision'])&&count(v.expectedRevision)&&v.expectedRevision<=2147483645)
  return {operationId,action:v.action as 'open'|'rotate'|'close',labelId,expectedRevision:v.expectedRevision};
 return null;
}
export type LabelShareReceipt=
 |{operationId:string;status:'rejected';action:LabelShareCommand['action'];reason:'share_revision_conflict'|'share_copy_required'|'share_unavailable'}
 |{operationId:string;status:'unknown'}
 |{operationId:string;status:'committed';action:'open'|'rotate'|'close';result:LabelShareState}
 |{operationId:string;status:'committed';action:'accept';result:LabelSharePreview}
 |{operationId:string;status:'committed';action:'unsubscribe';result:{labelId:string;subscribed:false}};
export function parseLabelShareReceipt(v:unknown,expected:LabelShareCommand):LabelShareReceipt|null{
 if(!record(v)||v.operationId!==expected.operationId)return null;
 if(v.status==='unknown')return keys(v,['operationId','status'])?v as LabelShareReceipt:null;
 if(v.status==='rejected')return keys(v,['operationId','status','action','reason'])&&v.action===expected.action&&typeof v.reason==='string'&&['share_revision_conflict','share_copy_required','share_unavailable'].includes(v.reason)?v as LabelShareReceipt:null;
 if(v.status!=='committed'||v.action!==expected.action||!keys(v,['operationId','status','action','result']))return null;
 if(v.action==='accept')return parseLabelSharePreview(v.result)?v as LabelShareReceipt:null;
 if(v.action==='unsubscribe')return record(v.result)&&keys(v.result,['labelId','subscribed'])&&v.result.labelId===('labelId'in expected?expected.labelId:null)&&v.result.subscribed===false?v as LabelShareReceipt:null;
 const result=parseLabelShareState(v.result);
 return result&&result.labelId===('labelId'in expected?expected.labelId:null)?v as LabelShareReceipt:null;
}
export type LabelShareCollectionsPage={labelId:string;collections:Array<{collectionId:string;name:string}>;nextCursor:string|null};
export function parseLabelShareCollectionsPage(v:unknown):LabelShareCollectionsPage|null{
 if(!record(v)||!keys(v,['labelId','collections','nextCursor'])||!copyUuid(v.labelId)||!Array.isArray(v.collections)||v.collections.length>100||v.nextCursor!==null&&!copyUuid(v.nextCursor))return null;
 let previous='';
 for(const row of v.collections){
  if(!record(row)||!keys(row,['collectionId','name'])||!copyUuid(row.collectionId)||typeof row.name!=='string'||row.name.length>1000||row.collectionId<=previous)return null;
  previous=row.collectionId;
 }
 if(v.nextCursor!==null&&v.nextCursor!==previous)return null;
 return v as LabelShareCollectionsPage;
}

import {parseSharePreview,type SharePreview} from './shareCommandContract';
export type SharedResourcePreview={kind:'label';preview:LabelSharePreview}|{kind:'collection';preview:SharePreview};
export function parseSharedResourcePreview(v:unknown):SharedResourcePreview|null{
 if(!record(v)||!keys(v,['kind','preview']))return null;
 if(v.kind==='label'){const preview=parseLabelSharePreview(v.preview);return preview?{kind:'label',preview}:null;}
 if(v.kind==='collection'){const preview=parseSharePreview(v.preview);return preview?{kind:'collection',preview}:null;}
 return null;
}
