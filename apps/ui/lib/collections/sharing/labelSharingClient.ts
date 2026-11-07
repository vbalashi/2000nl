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
