import {test} from 'node:test';
import assert from 'node:assert/strict';
import {browserProfile,gitChangedFiles} from './browser-profile.mjs';
test('only an exclusively release-specific diff selects the short profile',()=>{
 assert.equal(browserProfile(['apps/ui/lib/releases/appRelease.ts','apps/ui/components/releases/ReleaseUpdates.tsx']),'release');
 for(const files of [[],['db/migrations/371_release_notes_english_fallback.sql'],['apps/ui/lib/releases/appRelease.ts','apps/ui/package-lock.json'],['.github/workflows/checks.yml'],['apps/ui/components/navigation/AppFrame.tsx'],['apps/ui/lib/releases/nested/file.ts'],['apps/ui/lib/releases/a.ts\npackage.json']])assert.equal(browserProfile(files),'full');
});
test('diff must be bounded and derived from ancestor commits without rename shortcuts',()=>{
 const calls=[];const run=(program,args)=>{calls.push([program,args]);return args[0]==='diff'?Buffer.from('apps/ui/lib/releases/appRelease.ts\0'):Buffer.alloc(0)};
 assert.deepEqual(gitChangedFiles('a'.repeat(40),'b'.repeat(40),run),['apps/ui/lib/releases/appRelease.ts']);
 assert.deepEqual(calls[0][1].slice(0,2),['merge-base','--is-ancestor']);assert.ok(calls[1][1].includes('--no-renames'));
 assert.throws(()=>gitChangedFiles('no','b'.repeat(40),run));
 assert.throws(()=>gitChangedFiles('a'.repeat(40),'b'.repeat(40),()=>Buffer.alloc(0)));
});
