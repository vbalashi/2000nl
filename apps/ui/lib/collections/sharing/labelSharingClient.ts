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
