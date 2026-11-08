import {platformV2AuthenticatedJsonHeaders} from '@/lib/platform/platformV2Http';
import {platformFetchWithTimeout} from '@/lib/platform/platformFetchWithTimeout';
import {parseLabelSharingCatalog,type LabelSharingCatalog} from './labelSharingContract';
export async function readLabelSharingCatalog(userId:string,signal:AbortSignal):Promise<LabelSharingCatalog>{
 signal.throwIfAborted();
 const headers=await platformV2AuthenticatedJsonHeaders(userId);
 signal.throwIfAborted();
 const response=await platformFetchWithTimeout('/api/library/label-sharing/catalog',{
  method:'GET',headers,signal,credentials:'same-origin',cache:'no-store',
 });
 const value:unknown=response.ok?await response.json():null;
 await platformV2AuthenticatedJsonHeaders(userId);
 signal.throwIfAborted();
 const parsed=parseLabelSharingCatalog(value);
 if(!parsed)throw new Error('label_sharing_catalog_unavailable');
 return parsed;
}

import {parseLabelShareCommand,parseLabelShareReceipt,type LabelShareCommand,type LabelShareReceipt} from './labelSharingContract';
export type LabelShareIntent=Readonly<{userId:string;command:Readonly<LabelShareCommand>}>;
export function createLabelShareIntent(userId:string,value:LabelShareCommand):LabelShareIntent{
 const command=parseLabelShareCommand(value);
 if(!userId||!command)throw new Error('invalid_share_command');
 return Object.freeze({userId,command:Object.freeze(command)});
}
export const executeLabelShareIntent=(intent:LabelShareIntent,signal:AbortSignal)=>requestLabelShareIntent(intent,signal,false);
export const reconcileLabelShareIntent=(intent:LabelShareIntent,signal:AbortSignal)=>requestLabelShareIntent(intent,signal,true);
async function requestLabelShareIntent(intent:LabelShareIntent,signal:AbortSignal,reconcile:boolean):Promise<LabelShareReceipt|null>{
 const stable=createLabelShareIntent(intent.userId,intent.command);
 signal.throwIfAborted();
 const headers=await platformV2AuthenticatedJsonHeaders(stable.userId);
 signal.throwIfAborted();
 let value:unknown=null;
 try{
  const response=await platformFetchWithTimeout(reconcile?'/api/library/label-sharing/reconcile':'/api/library/label-sharing/commands',{
   method:'POST',headers,signal,credentials:'same-origin',cache:'no-store',body:JSON.stringify(stable.command),
  });
  if(response.ok)value=await response.json();
 }catch{
  // Transport failure cannot establish rollback; retain the same operation.
 }
 await platformV2AuthenticatedJsonHeaders(stable.userId);
 signal.throwIfAborted();
 return parseLabelShareReceipt(value,stable.command);
}

import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import {parseLabelShareState,type LabelShareState} from './labelSharingContract';
export async function readLabelShareState(userId:string,labelId:string,signal:AbortSignal):Promise<LabelShareState>{
 if(!copyUuid(labelId))throw new Error('invalid_share_request');
 const id=labelId.toLowerCase();signal.throwIfAborted();
 const headers=await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();
 const response=await platformFetchWithTimeout(`/api/library/label-sharing/state?labelId=${encodeURIComponent(id)}`,{
  method:'GET',headers,signal,credentials:'same-origin',cache:'no-store',
 });
 const value:unknown=response.ok?await response.json():null;
 await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();
 const parsed=parseLabelShareState(value);
 if(!parsed||parsed.labelId!==id)throw new Error('label_sharing_state_unavailable');
 return parsed;
}

import {parseLabelShareCollectionsPage,type LabelShareCollectionsPage} from './labelSharingContract';
export async function readLabelShareCollections(userId:string,labelId:string,after:string|null,signal:AbortSignal):Promise<LabelShareCollectionsPage>{
 if(!copyUuid(labelId)||after!==null&&!copyUuid(after))throw new Error('invalid_share_request');
 const id=labelId.toLowerCase();const params=new URLSearchParams({labelId:id});
 if(after)params.set('after',after.toLowerCase());
 signal.throwIfAborted();const headers=await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();
 const response=await platformFetchWithTimeout(`/api/library/label-sharing/collections?${params}`,{
  method:'GET',headers,signal,credentials:'same-origin',cache:'no-store',
 });
 const value:unknown=response.ok?await response.json():null;
 await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();
 const parsed=parseLabelShareCollectionsPage(value);
 if(!parsed||parsed.labelId!==id||after&&parsed.collections.some(row=>row.collectionId<=after.toLowerCase()))throw new Error('label_sharing_collections_unavailable');
 return parsed;
}

import {isCanonicalShareCode} from './shareCode';
import {parseSharedResourcePreview,type SharedResourcePreview} from './labelSharingContract';
export async function previewSharedResource(userId:string,code:string,signal:AbortSignal):Promise<SharedResourcePreview>{
 if(!isCanonicalShareCode(code))throw new Error('invalid_share_request');
 signal.throwIfAborted();const headers=await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();
 const response=await platformFetchWithTimeout('/api/library/label-sharing/preview',{
  method:'POST',headers,signal,credentials:'same-origin',cache:'no-store',body:JSON.stringify({code}),
 });
 const value:unknown=response.ok?await response.json():null;
 await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();
 if(response.status===404)throw new Error('share_preview_not_found');
 const parsed=parseSharedResourcePreview(value);if(!parsed)throw new Error('share_preview_unavailable');
 return parsed;
}

import {parseCollectionAccessPaths,type CollectionAccessPaths} from './labelSharingContract';
export async function readCollectionAccessPaths(userId:string,collectionId:string,signal:AbortSignal):Promise<CollectionAccessPaths>{
 if(!copyUuid(collectionId))throw new Error('invalid_share_request');
 const id=collectionId.toLowerCase();signal.throwIfAborted();
 const headers=await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();
 const response=await platformFetchWithTimeout(`/api/library/label-sharing/access-paths?collectionId=${encodeURIComponent(id)}`,{
  method:'GET',headers,signal,credentials:'same-origin',cache:'no-store',
 });
 const value:unknown=response.ok?await response.json():null;
 await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();
 const parsed=parseCollectionAccessPaths(value);
 if(!parsed||parsed.collectionId!==id)throw new Error('collection_access_paths_unavailable');
 return parsed;
}

import {parseLabelSharePreflight,type LabelSharePreflight} from './labelSharingContract';
export async function preflightLabelShare(userId:string,labelId:string,signal:AbortSignal):Promise<LabelSharePreflight>{
 if(!copyUuid(labelId))throw new Error('invalid_share_request');
 const id=labelId.toLowerCase();signal.throwIfAborted();
 const headers=await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();
 const response=await platformFetchWithTimeout(`/api/library/label-sharing/preflight?labelId=${encodeURIComponent(id)}`,{method:'GET',headers,signal,credentials:'same-origin',cache:'no-store'});
 const value:unknown=response.ok?await response.json():null;
 await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();
 const parsed=parseLabelSharePreflight(value);if(!parsed||parsed.labelId!==id)throw new Error('label_share_preflight_unavailable');return parsed;
}

import {parseLabelShareReferences,type LabelShareReferences} from './labelSharingContract';
export async function readLabelShareReferences(userId:string,labelId:string,signal:AbortSignal):Promise<LabelShareReferences>{
 if(!copyUuid(labelId))throw new Error('invalid_share_request');
 const id=labelId.toLowerCase();signal.throwIfAborted();
 const headers=await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();
 const response=await platformFetchWithTimeout(`/api/library/label-sharing/references?labelId=${encodeURIComponent(id)}`,{method:'GET',headers,signal,credentials:'same-origin',cache:'no-store'});
 const value:unknown=response.ok?await response.json():null;
 await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();
 const parsed=parseLabelShareReferences(value);if(!parsed||parsed.labelId!==id)throw new Error('label_share_references_unavailable');return parsed;
}
