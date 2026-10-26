import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import {isCanonicalShareCode} from './shareCode';
export type ShareCommand=
 |{operationId:string;action:'open'|'rotate'|'close';collectionId:string;expectedRevision:number}
 |{operationId:string;action:'accept';code:string}
 |{operationId:string;action:'unsubscribe';collectionId:string};
type CommittedShareCommand={operationId:string;status:'committed';action:ShareCommand['action'];collectionId:string};
export type RejectedShareCommandReceipt={operationId:string;status:'rejected';action:'open'|'rotate'|'close';collectionId:string;reason:'share_revision_conflict'|'share_copy_required'|'share_unavailable'};
export type ShareCommandReceipt=
 |RejectedShareCommandReceipt
 |{operationId:string;status:'unknown'}
 |(CommittedShareCommand&{available:true;role:'owner';isOpen:boolean;revision:number;invitationCode:string|null})
 |(CommittedShareCommand&{available:true;role:'viewer'})
 |(CommittedShareCommand&{available:false;role:null});
export type SharePreviewSample={headword:string;definition:string|null};
export type SharePreview={collectionId:string;name:string;entryCount:number;offeredRole:'viewer';role:'owner'|'viewer'|null;alreadyAdded:boolean;samples:SharePreviewSample[]};
const record=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,fields:string[])=>Object.keys(v).length===fields.length&&Object.keys(v).every(k=>fields.includes(k));
const revision=(v:unknown):v is number=>Number.isInteger(v)&&Number(v)>=0&&Number(v)<=2147483645;
export function parseShareCommand(value:unknown):ShareCommand|null{
 if(!record(value)||!copyUuid(value.operationId))return null;
 const operationId=value.operationId.toLowerCase();
 if(value.action==='accept'&&keys(value,['operationId','action','code'])&&isCanonicalShareCode(value.code))return {operationId,action:'accept',code:value.code};
 if(!copyUuid(value.collectionId))return null;
 const collectionId=value.collectionId.toLowerCase();
 if(value.action==='unsubscribe'&&keys(value,['operationId','action','collectionId']))return {operationId,action:'unsubscribe',collectionId};
 if(typeof value.action==='string'&&['open','rotate','close'].includes(value.action)&&keys(value,['operationId','action','collectionId','expectedRevision'])&&revision(value.expectedRevision))
  return {operationId,action:value.action as 'open'|'rotate'|'close',collectionId,expectedRevision:value.expectedRevision};
 return null;
}
export function parseShareCommandReceipt(value:unknown,operationId:string,expected?:ShareCommand):ShareCommandReceipt|null{
 if(!record(value)||value.operationId!==operationId||!copyUuid(value.operationId))return null;
 if(value.status==='unknown')return !expected&&keys(value,['operationId','status'])?{operationId,status:'unknown'}:null;
 if(value.status==='rejected'){
  if(!keys(value,['operationId','status','action','collectionId','reason'])||typeof value.action!=='string'||!['open','rotate','close'].includes(value.action)||!copyUuid(value.collectionId)||typeof value.reason!=='string'||!['share_revision_conflict','share_copy_required','share_unavailable'].includes(value.reason)||expected&&(value.action!==expected.action||!('collectionId'in expected)||value.collectionId!==expected.collectionId))return null;
  return value as RejectedShareCommandReceipt;
 }
 if(value.status!=='committed'||typeof value.action!=='string'||!['open','rotate','close','accept','unsubscribe'].includes(value.action)||!copyUuid(value.collectionId)||typeof value.available!=='boolean'||
  ![null,'owner','viewer'].includes(value.role as string|null)||value.available!==(value.role!==null))return null;
 const fields=['operationId','status','action','collectionId','available','role'];
 if(value.role==='owner'){
  fields.push('isOpen','revision','invitationCode');
  if(typeof value.isOpen!=='boolean'||!Number.isInteger(value.revision)||Number(value.revision)<0||Number(value.revision)>2147483646||
   (value.isOpen?!isCanonicalShareCode(value.invitationCode):value.invitationCode!==null))return null;
 }
 if(!keys(value,fields)||expected&&(value.action!==expected.action||('collectionId'in expected&&value.collectionId!==expected.collectionId)))return null;
 return value as ShareCommandReceipt;
}
export function parseSharePreview(value:unknown):SharePreview|null{
 const text=(v:unknown,max:number):v is string=>typeof v==='string'&&[...v].length<=max&&!v.includes('\0')&&![...v].some(c=>{const p=c.codePointAt(0)!;return p>=0xd800&&p<=0xdfff;});
 if(!record(value)||!keys(value,['collectionId','name','entryCount','offeredRole','role','alreadyAdded','samples'])||!copyUuid(value.collectionId)||typeof value.name!=='string'||value.name.length>1000||
  !Number.isSafeInteger(value.entryCount)||Number(value.entryCount)<0||value.offeredRole!=='viewer'||![null,'owner','viewer'].includes(value.role as string|null)||
  typeof value.alreadyAdded!=='boolean'||value.alreadyAdded!==(value.role!==null)||!Array.isArray(value.samples)||value.samples.length>Math.min(3,Number(value.entryCount))||
  value.samples.some(sample=>!record(sample)||!keys(sample,['headword','definition'])||!text(sample.headword,201)||!sample.headword.trim()||sample.definition!==null&&!text(sample.definition,301)))return null;
 return value as SharePreview;
}
