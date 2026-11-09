import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkInterfaceStandard,checkLiteralBaseline,collectLiteralStyles,paths} from './check-interface-standard.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const clean=Object.fromEntries(Object.values(paths).map(path=>[path,readFileSync(resolve(root,path),'utf8')]));
const check=sources=>checkInterfaceStandard(path=>sources[path]);
function altered(path,from,to){assert.ok(clean[path].includes(from));return {...clean,[path]:clean[path].replace(from,to)};}
test('current collection contract passes',()=>assert.deepEqual(check(clean),[]));
test('rejects a different semantic size for collection names',()=>assert.ok(check(altered(paths.css,'font-size:var(--practice-text-body);font-weight:400','font-size:var(--practice-text-lead);font-weight:400')).some(e=>e.includes('must use --practice-text-body'))));
test('rejects body semantic default changing from 14 to 18',()=>assert.ok(check(altered(paths.theme,'--account-practice-text-body, 14px','--account-practice-text-body, 18px')).some(e=>e.includes('default must remain 14px'))));
test('rejects raw CSS typography and named colors',()=>{const sources={...clean,[paths.css]:clean[paths.css]+'\n.newName {font-size:18px;color:red}'};assert.ok(check(sources).some(e=>e.includes('font-size must use')));assert.ok(check(sources).some(e=>e.includes('semantic color')));});
test('rejects inline typography even with semantic values',()=>assert.ok(check(altered(paths.received,'<CollectionSortControl ','<CollectionSortControl style={{fontSize:"var(--practice-text-lead)"}} ')).some(e=>e.includes('inline fontSize'))));
for(const key of ['personal','owned','received'])test(`rejects replacing ${key} sorting with native select`,()=>{const errors=check(altered(paths[key],'<CollectionSortControl ','<select aria-label="sort" '));assert.ok(errors.some(e=>e.includes('native select')));assert.ok(errors.some(e=>e.includes('must render shared CollectionSortControl')));});
test('rejects bypassing ActionMenu',()=>assert.ok(check(altered(paths.sort,'<ActionMenu ','<OtherMenu ')).some(e=>e.includes('must render shared ActionMenu'))));
test('rejects nonstandard Shared segmented control',()=>assert.ok(check(altered(paths.shared,'<SegmentedControl standard ','<SegmentedControl ')).some(e=>e.includes('must use SegmentedControl standard'))));
test('empty baseline rejects literals in new or existing files and cannot be expanded',()=>{const sources={'components/example.css':'.name{font-size:18px;color:#fff}'};assert.equal(checkLiteralBaseline(sources,{}).length,2);assert.ok(checkLiteralBaseline(sources,collectLiteralStyles(sources)).some(error=>error.includes('cannot be grandfathered')));assert.deepEqual(checkLiteralBaseline({'components/new.css':'.name{font-size:var(--practice-text-body);color:var(--practice-text)}'},{}),[]);});

test('rejects heading and sidebar role drift',()=>{assert.ok(check(altered(paths.css,'font-size:var(--practice-text-body-lg);font-weight:500','font-size:var(--practice-text-body);font-weight:500')).some(e=>e.includes('must use --practice-text-body-lg')));assert.ok(check(altered(paths.css,'.labelList button[aria-pressed]{font-size:var(--practice-text-caption)','.labelList button[aria-pressed]{font-size:var(--practice-text-body)')).some(e=>e.includes('must use --practice-text-caption')));});
test('rejects inline literal colors',()=>assert.ok(check(altered(paths.owned,'<CollectionSortControl ','<CollectionSortControl style={{color:"red"}} ')).some(e=>e.includes('inline color'))));

test('onboarding and updates cannot regain baseline exemptions',()=>{
 for(const file of ['components/onboarding/onboarding.module.css','components/releases/ReleaseUpdates.module.css']){
  const sources={[file]:'.heading{font-size:21px}'};
  assert.ok(checkLiteralBaseline(sources,collectLiteralStyles(sources)).some(error=>error.includes('cannot be grandfathered')));
 }
});

test('Sign out cannot drift back to tiny labels or lose selector specificity',()=>{assert.ok(check(altered(paths.settings,'font:400 var(--practice-text-caption)/1.5 var(--practice-font-ui);cursor:pointer;','font:400 var(--practice-text-label)/1.5 var(--practice-font-ui);cursor:pointer;')).some(error=>error.includes('Sign out')));assert.ok(check({...clean,[paths.settings]:clean[paths.settings].replaceAll('.settings .signOut','.signOut')}).some(error=>error.includes('Sign out')));});

test('retired baseline command fails without rewriting the checked-in file',()=>{const file=resolve(root,'scripts/interface-standard-baseline.json'),before=readFileSync(file,'utf8');const result=spawnSync(process.execPath,[resolve(root,'scripts/check-interface-standard.mjs'),'--write-baseline'],{encoding:'utf8'});assert.equal(result.status,1);assert.match(result.stderr,/baseline is retired/);assert.equal(readFileSync(file,'utf8'),before);});

test('launch and update buttons cannot diverge in geometry or typography',()=>{
 assert.ok(check(altered(paths.actions,'min-height: var(--practice-action-height)','min-height:36px')).some(error=>error.includes('shared launch/update')));
 assert.ok(check(altered(paths.actions,'400 var(--practice-text-small)/1.4','400 var(--practice-text-caption)/1.4')).some(error=>error.includes('shared launch/update')));
 assert.ok(check(altered(paths.release,'from "@/components/practice/ui/launchAction.module.css"','from "./localButtons.module.css"')).some(error=>error.includes('shared launch/update')));
});

test('shared publication names retain collection typography',()=>assert.ok(check(altered(paths.publication,'400 var(--practice-text-body)/1.5','400 var(--practice-text-lead)/1.5')).some(e=>e.includes('publication names'))));
