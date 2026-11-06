import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {webcrypto,createHash} from 'node:crypto';
import {canonicalJson,snapshotPayload} from '@/lib/i18n/snapshot-contract.mjs';
import {bundledInterfaceSnapshot,type InterfaceSnapshot} from '@/lib/i18n/runtime';
const make=(label:string):InterfaceSnapshot=>{
 const value=structuredClone(bundledInterfaceSnapshot);
 value.registry.fr={name:'Français',direction:'ltr',formatLocale:'fr-FR'};
 value.catalogs.fr=structuredClone(value.catalogs.en);value.catalogs.fr.ui.navigation.library=label;
 value.revision=createHash('sha256').update(canonicalJson(snapshotPayload(value))).digest('hex');return value;
};
const key=`2000nl:interface-catalog:${bundledInterfaceSnapshot.contract}`;
const setBootstrap=(value:unknown)=>{(window as Window&{__2000NL_INTERFACE_CATALOG__?:unknown}).__2000NL_INTERFACE_CATALOG__=value;};
beforeEach(()=>{vi.resetModules();localStorage.clear();setBootstrap(undefined);vi.stubGlobal('crypto',webcrypto);});
afterEach(()=>{setBootstrap(undefined);vi.restoreAllMocks();vi.unstubAllGlobals();});
test('bootstrap installs a new language before consumers mount and pins that snapshot for the document',async()=>{
 const snapshot=make('Bibliothèque');setBootstrap(snapshot);const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 const {localizedSection,getInterfaceCatalog}=await import('@/lib/i18n/catalog');
 const section=localizedSection('releases');
 const {initializeInterfaceSnapshot}=await import('@/lib/i18n/clientSnapshot');await initializeInterfaceSnapshot();
 expect((await import('@/lib/i18n/registry')).isInterfaceLanguage('fr')).toBe(true);
 expect(section.fr.about).toBeDefined();expect(getInterfaceCatalog('fr').ui.navigation.library).toBe('Bibliothèque');expect(fetch).not.toHaveBeenCalled();
 expect(JSON.parse(localStorage.getItem(key)!).revision).toBe(snapshot.revision);
 setBootstrap(make('A later revision'));await initializeInterfaceSnapshot();expect(getInterfaceCatalog('fr').ui.navigation.library).toBe('Bibliothèque');
});
test('a broken bootstrap and unavailable endpoint use only a verified compatible cached snapshot',async()=>{
 const snapshot=make('Cached library');localStorage.setItem(key,JSON.stringify(snapshot));setBootstrap({...snapshot,revision:'0'.repeat(64)});
 vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('offline')));
 await (await import('@/lib/i18n/clientSnapshot')).initializeInterfaceSnapshot();
 expect((await import('@/lib/i18n/catalog')).getInterfaceCatalog('fr').ui.navigation.library).toBe('Cached library');
});
test('corrupt cache and blocked storage cannot prevent bundled startup',async()=>{
 localStorage.setItem(key,'{"invalid":true}');vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('offline')));
 vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('blocked');});
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked');});
 await (await import('@/lib/i18n/clientSnapshot')).initializeInterfaceSnapshot();
 expect((await import('@/lib/i18n/catalog')).getInterfaceCatalog('en').ui.navigation.library).toBe(bundledInterfaceSnapshot.catalogs.en.ui.navigation.library);
});
test('a valid server rollback wins over a newer local copy',async()=>{
 localStorage.setItem(key,JSON.stringify(make('Newer cached text')));const rollback=make('Rolled back text');setBootstrap(rollback);
 vi.stubGlobal('fetch',vi.fn());await (await import('@/lib/i18n/clientSnapshot')).initializeInterfaceSnapshot();
 expect((await import('@/lib/i18n/catalog')).getInterfaceCatalog('fr').ui.navigation.library).toBe('Rolled back text');
 expect(JSON.parse(localStorage.getItem(key)!).revision).toBe(rollback.revision);
});
