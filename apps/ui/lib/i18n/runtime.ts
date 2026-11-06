import {interfaceCatalogs as bundledCatalogs, interfaceCatalogContract, type MessageCatalog} from './catalogs.generated';
import bundledRegistry from '@/locales/registry.json';
import {validSnapshot, canonicalJson, snapshotPayload, MAX_SNAPSHOT_BYTES} from './snapshot-contract.mjs';
export type InterfaceLocale = {name:string;direction:'ltr'|'rtl';formatLocale?:string};
export type InterfaceSnapshot = {formatVersion:1;contract:string;revision:string;registry:Record<string,InterfaceLocale>;catalogs:Record<string,MessageCatalog>};
export const bundledInterfaceSnapshot = {
  formatVersion:1,contract:interfaceCatalogContract,revision:'bundled',
  registry:bundledRegistry,catalogs:bundledCatalogs,
} as InterfaceSnapshot;
let active = bundledInterfaceSnapshot;
const listeners = new Set<()=>void>();
export const getInterfaceSnapshot = () => active;
export function subscribeInterfaceSnapshot(listener:()=>void) {listeners.add(listener);return ()=>{listeners.delete(listener);};}
export function parseInterfaceSnapshot(value:unknown):InterfaceSnapshot|null {
  return validSnapshot(value,bundledCatalogs.en,interfaceCatalogContract) ? value as InterfaceSnapshot : null;
}
export async function verifyInterfaceSnapshot(value:unknown):Promise<InterfaceSnapshot|null> {
  const snapshot=parseInterfaceSnapshot(value);
  if(!snapshot)return null;
  const bytes=new TextEncoder().encode(canonicalJson(snapshotPayload(snapshot)));
  if(bytes.length>MAX_SNAPSHOT_BYTES)return null;
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const revision=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  return revision===snapshot.revision?snapshot:null;
}
/** Install once before mounting learner surfaces. Updates never remount an active run. */
export function installInterfaceSnapshot(snapshot:InterfaceSnapshot) {
  active=snapshot;for(const listener of listeners)listener();
}
export function interfaceLocaleMap<T>(select:(catalog:MessageCatalog)=>T):Record<string,T> {
  return new Proxy(Object.create(null),{
    get:(_,code)=>typeof code==='string'&&Object.hasOwn(active.registry,code)?select(active.catalogs[code]):undefined,
    has:(_,code)=>typeof code==='string'&&Object.hasOwn(active.registry,code),
    ownKeys:()=>Object.keys(active.registry),
    getOwnPropertyDescriptor:(_,code)=>typeof code==='string'&&Object.hasOwn(active.registry,code)?{enumerable:true,configurable:true}:undefined,
  });
}
