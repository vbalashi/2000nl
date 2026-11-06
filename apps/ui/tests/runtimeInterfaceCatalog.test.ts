// @vitest-environment node
import {afterEach,expect,test} from 'vitest';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,renameSync,existsSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {canonicalJson,catalogShape,snapshotPayload,validSnapshot} from '@/lib/i18n/snapshot-contract.mjs';
import {bundledInterfaceSnapshot,installInterfaceSnapshot,type InterfaceSnapshot} from '@/lib/i18n/runtime';
import {createInterfaceSnapshotReader,interfaceSnapshotScript} from '@/lib/i18n/serverSnapshot';
import {getInterfaceCatalog,localizedSection,localizedField,mapInterfaceCatalogs} from '@/lib/i18n/catalog';
import {interfaceLanguages,isInterfaceLanguage} from '@/lib/i18n/registry';
import {searchCatalogLanguages} from '@/lib/languages/languageCatalog';
import {tourCopy} from '@/lib/onboarding/model';
const directories:string[]=[];
afterEach(()=>{installInterfaceSnapshot(bundledInterfaceSnapshot);for(const directory of directories.splice(0))rmSync(directory,{recursive:true,force:true});});
const sha=(value:unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex');
function fixture() {
 const directory=mkdtempSync(path.join(tmpdir(),'interface-runtime-'));directories.push(directory);
 const payload:InterfaceSnapshot=structuredClone({...bundledInterfaceSnapshot,registry:{...bundledInterfaceSnapshot.registry,fr:{name:'Français',direction:'ltr' as const,formatLocale:'fr-FR'}},catalogs:{...bundledInterfaceSnapshot.catalogs,fr:bundledInterfaceSnapshot.catalogs.en}});
 payload.catalogs.en.ui.navigation.library='Word library';payload.catalogs.fr.ui.navigation.library='Bibliothèque';payload.catalogs.fr.tour.interfaceTitle='Langue';payload.catalogs.fr.features.releases.about='À propos';
 const snapshot={...payload,revision:sha(snapshotPayload(payload))};
 const save=(value:unknown)=>{const temporary=path.join(directory,'next.tmp');writeFileSync(temporary,JSON.stringify(value));renameSync(temporary,path.join(directory,`${snapshot.contract}.json`));};
 save(snapshot);return {directory,snapshot,save};
}
test('a locale absent from the build works through registry, module-level adapters and tours',()=>{
 const section=localizedSection('releases'),field=localizedField('releases','about'),mapped=mapInterfaceCatalogs(c=>c.ui.navigation.library);
 const f=fixture();expect(isInterfaceLanguage('fr')).toBe(false);installInterfaceSnapshot(f.snapshot);
 expect(isInterfaceLanguage('fr')).toBe(true);expect(interfaceLanguages.find(item=>item.code==='fr')?.name).toBe('Français');
 expect(getInterfaceCatalog('fr').ui.navigation.library).toBe('Bibliothèque');
 expect(section.fr.about).toBe('À propos');expect(field.fr).toBe('À propos');expect(mapped.fr).toBe('Bibliothèque');expect(tourCopy.fr.interfaceTitle).toBe('Langue');
 expect(searchCatalogLanguages('anglais','fr').some(item=>item.code==='en')).toBe(true);
 expect(Object.keys(section)).toContain('fr');expect(getInterfaceCatalog('__proto__')).toBe(getInterfaceCatalog('en'));
});
test('text changes keep a contract; parameter and key changes need a separate contract',()=>{
 const source=bundledInterfaceSnapshot.catalogs.en,changed=structuredClone(source);
 changed.ui.navigation.library='A different heading';expect(sha(catalogShape(changed))).toBe(sha(catalogShape(source)));
 changed.ui.navigation.library='Heading {name}';expect(sha(catalogShape(changed))).not.toBe(sha(catalogShape(source)));
});
test('broken catalogs, registry values and wrong compatibility contracts are rejected',()=>{
 const {snapshot}=fixture(),source=bundledInterfaceSnapshot.catalogs.en;
 expect(validSnapshot(snapshot,source,snapshot.contract)).toBe(true);
 for(const mutate of [
  (s:InterfaceSnapshot)=>{Reflect.deleteProperty(s.catalogs.fr.ui.navigation,"library");},
  (s:InterfaceSnapshot)=>{s.catalogs.fr.ui.navigation.library=' ';},
  (s:InterfaceSnapshot)=>{s.catalogs.fr.ui.navigation.library='{unknown}';},
  (s:InterfaceSnapshot)=>{s.registry.fr.direction='invalid' as 'ltr';},
  (s:InterfaceSnapshot)=>{s.registry.fr.formatLocale='not_a_locale';},
  (s:InterfaceSnapshot)=>{s.contract='incompatible';},
 ]) {const copy=structuredClone(snapshot);mutate(copy);expect(validSnapshot(copy,source,snapshot.contract)).toBe(false);}
});
test('reader adopts atomic edits and rollback, retains last good on corruption, and isolates directories',async()=>{
 const f=fixture();let directory=f.directory;const read=createInterfaceSnapshotReader(()=>directory,0);
 expect((await read()).revision).toBe(f.snapshot.revision);
 const second=structuredClone(f.snapshot);second.catalogs.en.ui.navigation.library='Updated without a build';second.revision=sha(snapshotPayload(second));f.save(second);
 expect((await read()).catalogs.en.ui.navigation.library).toBe('Updated without a build');
 f.save({...second,revision:'0'.repeat(64)});expect((await read()).revision).toBe(second.revision);
 f.save({catalogs:{en:{}}});expect((await read()).revision).toBe(second.revision);
 f.save(f.snapshot);expect((await read()).revision).toBe(f.snapshot.revision);
 directory=path.join(f.directory,'empty');mkdirSync(directory);expect((await read()).catalogs.en.ui.navigation.library).toBe(bundledInterfaceSnapshot.catalogs.en.ui.navigation.library);
});
test('bootstrap is JSON data and cannot terminate its script element',()=>{
 const {snapshot}=fixture();snapshot.registry.fr.name='</script><script>alert(1)</script>\u2028';
 const text=interfaceSnapshotScript(snapshot);expect(text).not.toContain('</script>');expect(text).toContain('\\u003c');expect(text).toContain('\\u2028');
});
test('publisher validates review state, preserves revisions and reactivates a previous snapshot without a build',()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'interface-publish-'));directories.push(directory);
 const source=path.join(directory,'source'),out=path.join(directory,'published');mkdirSync(source);mkdirSync(path.join(source,'reviews'));
 const save=(name:string,value:unknown)=>writeFileSync(path.join(source,name),JSON.stringify(value));
 save('registry.json',{en:{name:'English',direction:'ltr'},fr:{name:'Français',direction:'ltr'}});
 save('en.json',{title:'Hello {name}'});save('fr.json',{title:'Bonjour {name}'});save('reviews/fr.json',{});
 const publish=()=>spawnSync(process.execPath,['scripts/interface-catalog-snapshot.mjs','--catalog-dir',source,'--out-dir',out],{encoding:'utf8'});
 expect(spawnSync(process.execPath,['scripts/interface-catalog-snapshot.mjs','--catalog-dir',source,'--out-dir',out,'--expect-contract','incorrect'],{encoding:'utf8'}).status).toBe(1);
 expect(publish().status).toBe(1);expect(existsSync(path.join(out,'active.json'))).toBe(false);
 const review=()=>spawnSync(process.execPath,['scripts/interface-localization.mjs','review','--catalog-dir',source,'--locale','fr','--all'],{encoding:'utf8'});
 expect(review().status).toBe(0);let result=publish();expect(result.status,result.stderr).toBe(0);
 const first=JSON.parse(result.stdout.trim().split('\n').at(-1)!);const archive=path.join(out,`${first.contract}.${first.revision}.json`);expect(existsSync(archive)).toBe(true);
 save('en.json',{title:'Welcome {name}'});expect(publish().status).toBe(1);review();result=publish();expect(result.status).toBe(0);
 const second=JSON.parse(result.stdout.trim().split('\n').at(-1)!);expect(second.contract).toBe(first.contract);expect(second.revision).not.toBe(first.revision);
 result=spawnSync(process.execPath,['scripts/interface-catalog-snapshot.mjs','--catalog-dir',source,'--out-dir',out,'--snapshot',archive],{encoding:'utf8'});expect(result.status,result.stderr).toBe(0);
 expect(JSON.parse(readFileSync(path.join(out,`${first.contract}.json`),'utf8')).revision).toBe(first.revision);
});
