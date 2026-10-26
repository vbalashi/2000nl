import { copyUuid } from '@/lib/platform/independentEntryCopyContract';
import { isCanonicalShareCode } from './shareCode';
export type CollectionShareManagement={collectionId:string;isOpen:boolean;revision:number;invitationCode:string|null;subscriberCount:number};
export type CollectionShareForward={collectionId:string;canForward:boolean;invitationCode:string|null};
const record=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
export function parseCollectionShareManagement(value:unknown,collectionId:string):CollectionShareManagement|null{
 if(!record(value)||!exact(value,['collectionId','isOpen','revision','invitationCode','subscriberCount'])||!copyUuid(value.collectionId)||value.collectionId!==collectionId||
  typeof value.isOpen!=='boolean'||!Number.isInteger(value.revision)||Number(value.revision)<0||Number(value.revision)>2147483646||
  !Number.isSafeInteger(value.subscriberCount)||Number(value.subscriberCount)<0||
  (value.isOpen?!isCanonicalShareCode(value.invitationCode):value.invitationCode!==null)||(!value.isOpen&&value.subscriberCount!==0))return null;
 return value as CollectionShareManagement;
}
export function parseCollectionShareForward(value:unknown,collectionId:string):CollectionShareForward|null{
 if(!record(value)||!exact(value,['collectionId','canForward','invitationCode'])||!copyUuid(value.collectionId)||value.collectionId!==collectionId||
  typeof value.canForward!=='boolean'||(value.canForward?!isCanonicalShareCode(value.invitationCode):value.invitationCode!==null))return null;
 return value as CollectionShareForward;
}
