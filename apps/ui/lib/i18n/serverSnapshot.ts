import 'server-only';
import {createHash} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {cache} from 'react';
import {bundledInterfaceSnapshot,parseInterfaceSnapshot,type InterfaceSnapshot} from './runtime';
import {canonicalJson,snapshotPayload,MAX_SNAPSHOT_BYTES} from './snapshot-contract.mjs';
const revision=(snapshot:InterfaceSnapshot)=>createHash('sha256').update(canonicalJson(snapshotPayload(snapshot))).digest('hex');
const fallback={...bundledInterfaceSnapshot,revision:revision(bundledInterfaceSnapshot)};
/** A process keeps the last verified whole snapshot; readers never see partial locale updates. */
export function createInterfaceSnapshotReader(directory:()=>string|undefined, refreshMs=5000) {
  type State={location:string|undefined;current:InterfaceSnapshot;checkedAt:number;pending:Promise<InterfaceSnapshot>|null};
  let state:State={location:undefined,current:fallback,checkedAt:0,pending:null};
  return async ():Promise<InterfaceSnapshot>=>{
    const next=directory();
    if(state.location!==next)state={location:next,current:fallback,checkedAt:0,pending:null};
    if(!next)return fallback;
    const slot=state;
    if(slot.pending)return slot.pending;
    if(Date.now()-slot.checkedAt<refreshMs)return slot.current;
    slot.pending=(async()=>{
      const controller=new AbortController();
      let timer:ReturnType<typeof setTimeout>|undefined;
      try {
        const load=async()=>{
          const filename=path.join(next,`${fallback.contract}.json`);
          if((await stat(filename)).size>MAX_SNAPSHOT_BYTES)return null;
          const bytes=await readFile(filename,{signal:controller.signal});
          if(bytes.length>MAX_SNAPSHOT_BYTES)return null;
          const candidate=parseInterfaceSnapshot(JSON.parse(bytes.toString('utf8')));
          return candidate&&revision(candidate)===candidate.revision?candidate:null;
        };
        const candidate=await Promise.race([load(),new Promise<null>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(null);},750);})]);
        if(candidate)slot.current=candidate;
      } catch { /* Keep the last verified revision; catalogs never block app startup. */ }
      finally {clearTimeout(timer);slot.checkedAt=Date.now();slot.pending=null;}
      return slot.current;
    })();
    return slot.pending;
  };
}
const readSnapshot=createInterfaceSnapshotReader(()=>process.env.INTERFACE_CATALOG_DIR);
// A document, its metadata and server-rendered routes use the same revision.
export const getRequestInterfaceSnapshot=typeof cache==='function'?cache(readSnapshot):readSnapshot;
export {readSnapshot as readInterfaceSnapshot};
export function interfaceSnapshotScript(snapshot:InterfaceSnapshot):string {
  const escaped=JSON.stringify(snapshot).replace(/[<>&\u2028\u2029]/g,char=>`\\u${char.charCodeAt(0).toString(16).padStart(4,'0')}`);
  return `window.__2000NL_INTERFACE_CATALOG__=${escaped};`;
}
