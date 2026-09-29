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
 const colors=[],sizes=[],families=[];let important=0;
 postcss.parse(fs.readFileSync(file,'utf8')).walkDecls(decl=>{
  colors.push(...decl.value.match(colorPattern)||[]);
  if(decl.prop==='font-size')sizes.push(decl.value);
  if(decl.prop==='font-family')families.push(decl.value);
  if(decl.important)important++;
 });
 return {file:path.relative(ui,file),selected:selectedNames.includes(path.basename(file)),colors:[...new Set(colors.map(value=>value.toLowerCase()))].sort(),colorOccurrences:colors.length,fontSizes:[...new Set(sizes)].sort(),fontFamilies:[...new Set(families)].sort(),important};
});
function aggregate(rows){return {files:rows.length,uniqueColors:new Set(rows.flatMap(row=>row.colors)).size,colorOccurrences:rows.reduce((n,row)=>n+row.colorOccurrences,0),uniqueFontSizes:new Set(rows.flatMap(row=>row.fontSizes)).size,fontFamilies:[...new Set(rows.flatMap(row=>row.fontFamilies))],important:rows.reduce((n,row)=>n+row.important,0)};}
const report={scope:'CSS declarations, including fallback literals; not computed on-screen colors or loaded font count',allPrototype:aggregate(inventory.filter(row=>row.file.startsWith('app/'))),selectedLeaves:aggregate(inventory.filter(row=>row.selected)),inventory};
if(process.argv.includes('--check')){
 const guardedPreview=['prototype.module.css','trainingHome.module.css','libraryStudy.module.css'];
 const bad=inventory.filter(row=>(row.selected||row.file.startsWith('components/')||guardedPreview.includes(path.basename(row.file)))&&!row.file.endsWith('practiceTheme.module.css')).filter(row=>row.colors.length||row.fontSizes.some(value=>/\dpx\b/.test(value))||row.fontFamilies.some(value=>value!=='inherit'&&value!=='var(--default-font-family)'&&!value.startsWith('var(--practice-font-')));
 if(bad.length){console.error('Untokenized presentation styles:',bad.map(row=>row.file).join(', '));process.exitCode=1;}else console.log('Shared theme guard passed.');
}else console.log(JSON.stringify(report,null,2));
