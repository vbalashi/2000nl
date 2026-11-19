import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// Only isolated release-information changes qualify. Shared UI, database,
// configuration, dependencies, CI and unknown files always take the full path.
const allowed = [
 /^apps\/ui\/lib\/releases\/[A-Za-z0-9_.-]+\.(?:ts|tsx)$/,
 /^apps\/ui\/components\/releases\/[A-Za-z0-9_.-]+\.(?:ts|tsx|css)$/,
 /^apps\/ui\/app\/api\/app-release\/route\.ts$/,
 /^apps\/ui\/app\/updates\/page\.tsx$/,
 /^apps\/ui\/tests\/(?:releaseCatalogServer|releaseUpdatesUi|useAppRelease|appRelease)\.test\.(?:ts|tsx)$/,
 /^apps\/ui\/tests\/api\/appReleaseRoute\.test\.ts$/,
 /^apps\/ui\/playwright\/tests\/release-updates\.spec\.ts$/,
];
const documentation = /^(?:README|CONTRIBUTING|CONTENT-LICENSING|docs\/[A-Za-z0-9_./-]+)\.md$/;
export function browserProfile(files){
 if(Array.isArray(files)&&files.length>0&&files.every(file=>typeof file==='string'&&documentation.test(file)))return 'docs';
 return Array.isArray(files)&&files.length>0&&files.every(file=>typeof file==='string'&&allowed.some(rule=>rule.test(file)))?'release':'full';
}
export function gitChangedFiles(base,head,run=execFileSync){
 if(!/^[a-f0-9]{40}$/.test(base??'')||! /^[a-f0-9]{40}$/.test(head??''))throw Error('Exact commits required');
 run('git',['merge-base','--is-ancestor',base,head],{stdio:'ignore'});
 const bytes=run('git',['diff','--no-renames','--name-only','-z',base,head],{maxBuffer:8*1024*1024});
 const text=bytes.toString('utf8');if(!Buffer.from(text).equals(bytes)||!text.endsWith('\0'))throw Error('Invalid or empty diff');
 return text.slice(0,-1).split('\0');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(browserProfile(gitChangedFiles(process.argv[2],process.argv[3])));}
 catch{console.log('full');}
}
