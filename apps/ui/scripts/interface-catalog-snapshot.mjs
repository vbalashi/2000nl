#!/usr/bin/env node
import {createHash,randomUUID} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync,unlinkSync,openSync,fsyncSync,closeSync,statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {catalogShape,canonicalJson,snapshotPayload,validSnapshot,MAX_SNAPSHOT_BYTES} from '../lib/i18n/snapshot-contract.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args = process.argv.slice(2);
const option = name => {const i=args.indexOf(`--${name}`);return i<0?undefined:args[i+1];};
const hash = value => createHash('sha256').update(canonicalJson(value)).digest('hex');
try {
  if (!option('out-dir')) throw new Error('Specify --out-dir for the operator-owned catalog directory.');
  const directory=path.resolve(option('catalog-dir')??path.join(root,'locales'));
  const load=name=>JSON.parse(readFileSync(path.join(directory,name),'utf8'));
  const source=load('en.json'), contract=hash(catalogShape(source));
  if(option('expect-contract')&&option('expect-contract')!==contract)throw new Error('The source contract does not match the target application.');
  let snapshot;
  if (option('snapshot')) {
    if (statSync(option('snapshot')).size>MAX_SNAPSHOT_BYTES) throw new Error('Snapshot is too large.');
    snapshot=JSON.parse(readFileSync(option('snapshot'),'utf8'));
  } else {
    const check=spawnSync(process.execPath,[path.join(root,'scripts/interface-localization.mjs'),'check','--catalog-dir',directory],{stdio:'inherit'});
    if(check.status!==0) throw new Error('Translate and explicitly review all registered catalogs before publication.');
    const registry=load('registry.json');
    const payload={formatVersion:1,contract,registry,catalogs:Object.fromEntries(Object.keys(registry).map(code=>[code,load(`${code}.json`)]))};
    snapshot={...payload,revision:hash(payload)};
  }
  if(!validSnapshot(snapshot,source,contract) || hash(snapshotPayload(snapshot))!==snapshot.revision) throw new Error('Snapshot is invalid or incompatible with this source contract.');
  const text=canonicalJson(snapshot)+'\n';
  if(Buffer.byteLength(text)>MAX_SNAPSHOT_BYTES) throw new Error('Snapshot is too large.');
  const output=path.resolve(option('out-dir'));mkdirSync(output,{recursive:true});
  const archive=path.join(output,`${contract}.${snapshot.revision}.json`);
  if(!existsSync(archive)) writeFileSync(archive,text,{flag:'wx',mode:0o644});
  else if(readFileSync(archive,'utf8')!==text) throw new Error('Existing revision archive has different content.');
  const temporary=path.join(output,`.${contract}.${randomUUID()}.tmp`);
  try {
    const fd=openSync(temporary,'wx',0o644);
    try {writeFileSync(fd,text);fsyncSync(fd);} finally {closeSync(fd);}
    renameSync(temporary,path.join(output,`${contract}.json`));
  } finally {if(existsSync(temporary))unlinkSync(temporary);}
  console.log(JSON.stringify({contract,revision:snapshot.revision,languages:Object.keys(snapshot.registry),activeFile:path.join(output,`${contract}.json`)}));
} catch(error) {console.error(error.message);process.exitCode=1;}
