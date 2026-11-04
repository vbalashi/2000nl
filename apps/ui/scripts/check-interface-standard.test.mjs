import {test} from 'node:test';
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
test('baseline rejects new files and increased literal counts',()=>{const legacy={'components/old.css':'.name{font-size:18px;color:#fff}'};const baseline=collectLiteralStyles(legacy);assert.deepEqual(checkLiteralBaseline(legacy,baseline),[]);assert.equal(checkLiteralBaseline({...legacy,'components/new.css':'.name{font-size:18px}'},baseline).length,1);assert.equal(checkLiteralBaseline({'components/old.css':legacy['components/old.css']+legacy['components/old.css']},baseline).length,2);assert.deepEqual(checkLiteralBaseline({'components/new.css':'.name{font-size:var(--practice-text-body);color:var(--practice-text)}'},baseline),[]);});

test('rejects heading and sidebar role drift',()=>{assert.ok(check(altered(paths.css,'font-size:var(--practice-text-body-lg);font-weight:500','font-size:var(--practice-text-body);font-weight:500')).some(e=>e.includes('must use --practice-text-body-lg')));assert.ok(check(altered(paths.css,'.labelList button[aria-pressed]{font-size:var(--practice-text-caption)','.labelList button[aria-pressed]{font-size:var(--practice-text-body)')).some(e=>e.includes('must use --practice-text-caption')));});
test('rejects inline literal colors',()=>assert.ok(check(altered(paths.owned,'<CollectionSortControl ','<CollectionSortControl style={{color:"red"}} ')).some(e=>e.includes('inline color'))));
