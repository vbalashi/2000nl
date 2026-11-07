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
