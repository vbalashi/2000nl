import { authenticatedAccountRequest } from "@/lib/preferences/accountRequest";
import type { LibraryEntryFilters, LibraryMaterialScope } from "@/lib/platform/librarySearchScope";
export type WordsBulkRequest = {groups:string[];all:boolean;category:"browse"|"headwords";query:string;language:string;dictionaryIds:string[]|null;filters:LibraryEntryFilters;material?:LibraryMaterialScope;listId:string};
export type WordsBulkResult = {planId:string;collectionId:string;articleCount:number;meaningCount:number;audience:unknown[]};
export type WordsBulkReceipt = {planId:string;status:'unknown'}|{planId:string;collectionId:string;status:'pending'|'expired'}|{planId:string;status:'committed';collectionId:string;addedCount:number};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function request(userId:string, method:string, body:unknown, signal?:AbortSignal):Promise<unknown>{
 const url=method==='GET'?`/api/library/bulk-collection?planId=${encodeURIComponent(String(body))}`:'/api/library/bulk-collection';
 const response=await authenticatedAccountRequest(url,userId,{method,...(method==='GET'?{}:{body:JSON.stringify(body)}),signal});
 if(!response.ok)throw new Error(response.status===409?'selection_changed':response.status===422?'selection_too_broad':'bulk_unavailable');
 return response.json();
}
export async function wordsBulkCollection(userId:string,input:WordsBulkRequest,signal?:AbortSignal):Promise<WordsBulkResult>{
 const value=await request(userId,'POST',input,signal) as WordsBulkResult;
 if(!value || !uuid.test(value.planId)||value.collectionId!==input.listId||!Number.isSafeInteger(value.articleCount)||value.articleCount<0||!Number.isSafeInteger(value.meaningCount)||value.meaningCount<0||!Array.isArray(value.audience)||!value.audience.every((v:unknown)=>{if(!v||typeof v!=='object')return false;const r=v as {userId?:unknown;paths?:unknown};return typeof r.userId==='string'&&uuid.test(r.userId)&&Array.isArray(r.paths)&&r.paths.length>0&&r.paths.every((p:unknown)=>{if(!p||typeof p!=='object')return false;const path=p as {rootId?:unknown;kind?:unknown;lifetime?:unknown};return typeof path.rootId==='string'&&uuid.test(path.rootId)&&(path.kind==='collection'||path.kind==='label')&&typeof path.lifetime==='string'&&uuid.test(path.lifetime);});}))throw new Error('bulk_unavailable');
 return value;
}
export async function wordsBulkReceipt(userId:string,planId:string,confirm:boolean,signal?:AbortSignal):Promise<WordsBulkReceipt>{
 const value=await request(userId,confirm?'PUT':'GET',confirm?{planId}:planId,signal) as WordsBulkReceipt;
 if(!value||value.planId!==planId||!['committed','pending','expired','unknown'].includes(value.status)||(value.status!=='unknown'&&!uuid.test(value.collectionId))||(value.status==='committed'&&!Number.isSafeInteger(value.addedCount)))throw new Error('bulk_unavailable');
 return value;
}
