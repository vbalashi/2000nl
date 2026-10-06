import fs from 'node:fs';
import {adapt} from './adapt.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../../../..'),ui=path.join(repo,'apps/ui');
const require=createRequire(path.join(ui,'package.json'));
const esbuild=require('esbuild');
const original=fs.readFileSync(path.join(ui,'components/training/pilot/ApprovedTrainingBuilder.tsx'),'utf8');
let source=original.replace('  X,','  X,\n  Pencil,');
source=source.replace('"./TrainingMixPicker"','"@/components/training/pilot/TrainingMixPicker"').replace('"./TrainingSessionSizePicker"','"@/components/training/pilot/TrainingSessionSizePicker"').replace('"./approvedTrainingBuilder.module.css"','"@/components/training/pilot/approvedTrainingBuilder.module.css"');
const oldName=source.slice(source.indexOf('          {p.editing && <label'),source.indexOf('          {section(\n            "language"'));
if(!oldName.includes('maxLength={160}'))throw Error('Name presentation changed; inspect adapter');
source=source.replace(oldName,'          {p.editing && <ReviewName name={p.name} onChange={p.onNameChange} disabled={saving}/> }\n');
source=source.replace('<Trash2 size={16} /></button>','<Trash2 size={16} /><span>{deleteLabel}</span></button>');
source=source.replace('`${familyName} · ${direction} · ${b.answerModes["Reveal & self-rate"]}`','`${familyName} · ${direction}`');
source+=`\nfunction ReviewName({name,onChange,disabled}:{name:string;onChange:(name:string)=>void;disabled:boolean}){const [editing,setEditing]=useState(false);return <div className="review-name">{editing?<input aria-label="Training name" value={name} maxLength={160} disabled={disabled} autoFocus onChange={e=>onChange(e.target.value)} onBlur={()=>setEditing(false)} onKeyDown={e=>{if(e.key==="Enter"||e.key==="Escape")setEditing(false)}}/>:<><h2>{name}</h2><button type="button" aria-label="Edit training name" disabled={disabled} onClick={()=>setEditing(true)}><Pencil size={16}/></button></>}</div>}\n`;
source=adapt(source,here);
fs.writeFileSync(path.join(here,'Builder.generated.tsx'),source);
const controller=fs.readFileSync(path.join(ui,'components/training/pilot/TrainingTodaySetup.tsx'),'utf8');
const defaults=controller.slice(controller.indexOf('const defaultModesForScenario ='),controller.indexOf('const familyForDraft ='));
const callbacks=controller.slice(controller.indexOf('  const selectFamily ='),controller.indexOf('  if (trainingPresentationV1Enabled()) return <ApprovedTrainingBuilder'));
if(!callbacks.includes('const changeMix'))throw Error('Controller boundaries changed; inspect adapter');
fs.writeFileSync(path.join(here,'controller.generated.txt'),defaults+'\n'+callbacks);
const entry=fs.readFileSync(path.join(here,'Review.tsx'),'utf8').replace('/* SOURCE_DEFAULT_MODES */',defaults).replace('/* SOURCE_CONTROLLER */',callbacks);
fs.writeFileSync(path.join(here,'Review.generated.tsx'),entry);
const result=await esbuild.build({entryPoints:[path.join(here,'Review.generated.tsx')],absWorkingDir:ui,tsconfig:path.join(ui,'tsconfig.json'),bundle:true,minify:false,write:false,outdir:path.join(here,'bundle'),nodePaths:[path.join(ui,'node_modules')],loader:{'.css':'local-css'},define:{'process.env.NODE_ENV':'"production"'},target:'es2022'});
// Assign stable CSS module names before compacting the finished outputs.
const js=(await esbuild.transform(result.outputFiles.find(f=>f.path.endsWith('.js')).text,{minify:true,target:'es2022'})).code;
const css=(await esbuild.transform(result.outputFiles.find(f=>f.path.endsWith('.css')).text,{loader:'css',minify:true})).code;
// Raw fragments may be opened in quirks mode, where class names match without case.
// Keep readable module names and fail rather than ship conflicting selectors.
const classes=new Map();
for(const match of css.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)(?=[\s:{>.,\[])/g)){
  const name=match[1],key=name.toLowerCase(),previous=classes.get(key);
  if(previous&&previous!==name)throw Error(`Case-insensitive CSS collision: ${previous} / ${name}`);
  classes.set(key,name);
}
const fragment='<div id="nl-builder-real-review"></div>\n<style>\n'+css+'\n</style>\n<script>\n'+js.replaceAll('</script','<\\/script')+'\n</script>\n';
if(Buffer.byteLength(fragment)>1000000)throw Error('Preview too large');
fs.writeFileSync(path.join(here,'../session-builder.fragment.html'),fragment);
console.log('Built production-component preview: '+Buffer.byteLength(fragment)+' bytes');
