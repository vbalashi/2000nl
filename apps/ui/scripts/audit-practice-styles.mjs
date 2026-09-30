import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import postcss from 'postcss';
const ui=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const prototype=path.join(ui,'app/dev/session-builder-prototype');
const shared=path.join(ui,'components/practice');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory()?files(path.join(dir,item.name)):item.name.endsWith('.css')?[path.join(dir,item.name)]:[]);}
const selectedNames=['trainingSession.module.css','practicePanel.module.css','trainingOverview.module.css','wordDetails.module.css','libraryFilters.module.css','builderScope.module.css','settings.module.css','statistics.module.css','library.module.css','libraryOverlays.module.css'];
const colorPattern=/#(?:[a-f0-9]{8}|[a-f0-9]{6}|[a-f0-9]{4}|[a-f0-9]{3})\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(?:white|black)\b/gi;
const inventory=files(prototype).concat(files(shared)).map(file=>{
 const colors=[],sizes=[],families=[],geometry=[];let important=0;
 postcss.parse(fs.readFileSync(file,'utf8')).walkDecls(decl=>{
  colors.push(...decl.value.match(colorPattern)||[]);
  if(decl.prop==='font-size')sizes.push(decl.value);
  if(decl.prop==='font-family')families.push(decl.value);
  if(/^(margin|padding|gap|row-gap|column-gap|border-radius|line-height|height|min-height|max-height)/.test(decl.prop))geometry.push(`${decl.prop}: ${decl.value}`);
  if(decl.important)important++;
 });
 return {file:path.relative(ui,file),selected:selectedNames.includes(path.basename(file)),colors:[...new Set(colors.map(value=>value.toLowerCase()))].sort(),colorOccurrences:colors.length,fontSizes:[...new Set(sizes)].sort(),fontFamilies:[...new Set(families)].sort(),important,geometry:[...new Set(geometry)].sort()};
});
function aggregate(rows){return {files:rows.length,uniqueColors:new Set(rows.flatMap(row=>row.colors)).size,colorOccurrences:rows.reduce((n,row)=>n+row.colorOccurrences,0),uniqueFontSizes:new Set(rows.flatMap(row=>row.fontSizes)).size,fontFamilies:[...new Set(rows.flatMap(row=>row.fontFamilies))],important:rows.reduce((n,row)=>n+row.important,0)};}
const report={scope:'CSS declarations, including fallback literals; not computed on-screen colors or loaded font count',allPrototype:aggregate(inventory.filter(row=>row.file.startsWith('app/'))),selectedLeaves:aggregate(inventory.filter(row=>row.selected)),inventory};
if(process.argv.includes('--check')){
 const guardedPreview=['prototype.module.css','trainingHome.module.css','libraryStudy.module.css'];
 const bad=inventory.filter(row=>(row.selected||row.file.startsWith('components/')||guardedPreview.includes(path.basename(row.file)))&&!row.file.endsWith('practiceTheme.module.css')).filter(row=>row.colors.length||row.fontSizes.some(value=>/\dpx\b/.test(value))||row.fontFamilies.some(value=>value!=='inherit'&&value!=='var(--default-font-family)'&&!value.startsWith('var(--practice-font-')));
 if(bad.length){console.error('Untokenized presentation styles:',bad.map(row=>row.file).join(', '));process.exitCode=1;}else console.log('Shared theme guard passed.');
 // Working screens still carry legacy literals; counts may only fall.
 const baselineFile=path.join(ui,'scripts/practice-style-baseline.json');
 const legacyPattern=/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|\b(?:text|bg|border|ring|from|to|via|fill|stroke|outline|divide|shadow)-(?:slate|gray|zinc|neutral|stone|indigo|violet|purple|blue|sky|cyan|teal|emerald|green|lime|amber|yellow|orange|red|rose|pink|white|black)(?:-\d{2,3})?\b|\btext-\[\d+(?:\.\d+)?px\]/gi;
 const sourceFiles=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory()?sourceFiles(path.join(dir,item.name)):/\.(tsx?|css)$/.test(item.name)&&!/\.test\./.test(item.name)?[path.join(dir,item.name)]:[]);
 const counts=Object.fromEntries(['components/training','components/navigation'].flatMap(dir=>sourceFiles(path.join(ui,dir)))
  .map(file=>[path.relative(ui,file),(fs.readFileSync(file,'utf8').match(legacyPattern)||[]).length]).filter(([,n])=>n>0).sort());
 if(process.argv.includes('--update-baseline')){fs.writeFileSync(baselineFile,JSON.stringify(counts,null,1)+'\n');console.log('Legacy literal baseline updated.');}
 else{
  const baseline=JSON.parse(fs.readFileSync(baselineFile,'utf8'));
  const grown=Object.entries(counts).filter(([file,n])=>n>(baseline[file]??0));
  const stale=Object.entries(baseline).filter(([file,n])=>(counts[file]??0)<n);
  if(grown.length){console.error('New legacy colour/size literals:',grown.map(([f,n])=>`${f} ${baseline[f]??0}→${n}`).join(', '));process.exitCode=1;}
  else console.log(`Legacy literal ratchet passed (${Object.values(counts).reduce((a,b)=>a+b,0)} remaining).`);
  if(stale.length)console.log('Baseline can be lowered (--check --update-baseline):',stale.map(([f])=>f).join(', '));
 }
}else console.log(JSON.stringify(report,null,2));
