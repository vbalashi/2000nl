import {interfaceCatalogContract} from './catalogs.generated';
import {bundledInterfaceSnapshot, installInterfaceSnapshot, verifyInterfaceSnapshot, type InterfaceSnapshot} from './runtime';
import {MAX_SNAPSHOT_BYTES} from './snapshot-contract.mjs';
const cacheKey=`2000nl:interface-catalog:${interfaceCatalogContract}`;
let loading:Promise<void>|null=null;
async function decode(raw:string|null):Promise<InterfaceSnapshot|null> {
  if(!raw||new TextEncoder().encode(raw).length>MAX_SNAPSHOT_BYTES)return null;
  try {return await verifyInterfaceSnapshot(JSON.parse(raw));}catch{return null;}
}
async function fetchSnapshot():Promise<InterfaceSnapshot|null> {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),1500);
  try {
    const response=await fetch(`/api/interface-catalog?contract=${interfaceCatalogContract}`,{cache:'no-store',signal:controller.signal});
    if(!response.ok||Number(response.headers.get('content-length'))>MAX_SNAPSHOT_BYTES)return null;
    const reader=response.body?.getReader();
    if(!reader)return null;
    const chunks:Uint8Array[]= [];let length=0;
    for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX_SNAPSHOT_BYTES){await reader.cancel();return null;}chunks.push(value);}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    return decode(new TextDecoder().decode(bytes));
  }catch{return null;}finally{clearTimeout(timer);}
}
/** One snapshot per document. Reload adopts edits; active training state is never remounted. */
export function initializeInterfaceSnapshot():Promise<void> {
  if(loading)return loading;
  loading=(async()=>{
    let snapshot:InterfaceSnapshot|null=null;
    try {
      const bootstrap=(window as Window&{__2000NL_INTERFACE_CATALOG__?:unknown}).__2000NL_INTERFACE_CATALOG__;
      if(bootstrap)snapshot=await verifyInterfaceSnapshot(bootstrap);
    } catch { /* Fall back to a bounded same-origin read and then a verified local copy. */ }
    if(!snapshot)snapshot=await fetchSnapshot();
    if(!snapshot){try{snapshot=await decode(localStorage.getItem(cacheKey));}catch{ /* Storage may be blocked. */ }}
    installInterfaceSnapshot(snapshot??bundledInterfaceSnapshot);
    if(snapshot){try{
      const oldKeys=Object.keys(localStorage).filter(key=>key.startsWith('2000nl:interface-catalog:')&&key!==cacheKey);
      for(const key of oldKeys.slice(0,Math.max(0,oldKeys.length-1)))localStorage.removeItem(key);
      localStorage.setItem(cacheKey,JSON.stringify(snapshot));}catch{ /* A full or blocked cache does not affect the chosen snapshot. */ }}
  })();
  return loading;
}
