import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import postcss from 'postcss';
import ts from 'typescript';

const base='components/library/';
export const paths={css:base+'organization/organization.module.css',theme:'components/practice/ui/practiceTheme.module.css',personal:base+'organization/PersonalCollections.tsx',owned:base+'sharing/OwnedSharedCollections.tsx',received:base+'sharing/ReceivedCollections.tsx',sort:base+'organization/CollectionSortControl.tsx',shared:base+'sharing/SharedCollectionsWorkspace.tsx'};
/** Bounded collection presentation contract; intentionally not a legacy-wide style linter. */
export function checkInterfaceStandard(read){
 const errors=[];
 const fail=(file,message)=>errors.push(`${file}: ${message}`);
 const css=postcss.parse(read(paths.css),{from:paths.css});
 const roles=[['.labelPanel h2','--practice-text-body-lg'],['.catalogHeader h2','--practice-text-body-lg'],['.collection .collectionName','--practice-text-body'],['.received .collectionName','--practice-text-body'],['.ownedSharedName button','--practice-text-body'],['.labelList button[aria-pressed]','--practice-text-caption']];
 for(const [selector,token] of roles){
  let found=false;
  css.walkRules(rule=>{if(!rule.selectors.includes(selector))return;rule.walkDecls('font-size',decl=>{found=true;if(decl.value!==`var(${token})`)fail(paths.css,`${selector} must use ${token}, found ${decl.value}`);});});
  if(!found)fail(paths.css,`${selector} needs an explicit ${token} font-size`);
 }
 css.walkDecls(decl=>{
  if(decl.prop==='font-size'&&!/^var\(--practice-[\w-]+\)$/.test(decl.value))fail(paths.css,`${decl.parent.selector}: font-size must use a semantic practice token`);
  // Strip semantic variables, then reject literal color syntax (including shorthand borders).
  const rest=decl.value.replace(/var\(--practice-[\w-]+\)/g,'');
  if(/#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|lab|color)\s*\(/i.test(rest))fail(paths.css,`${decl.parent.selector}: raw color in ${decl.prop}`);
  if(/(?:color|background|fill|stroke)$/.test(decl.prop)&&!/^\s*(?:var\(--practice-[\w-]+\)|transparent|none|inherit|currentColor)\s*$/.test(decl.value))fail(paths.css,`${decl.parent.selector}: ${decl.prop} must use a semantic color token`);
  if(decl.prop==='font'&&decl.value!=='inherit'&&!decl.value.includes('var(--practice-text-'))fail(paths.css,`${decl.parent.selector}: font shorthand must use semantic typography`);
 });
 const theme=postcss.parse(read(paths.theme));
 for(const [token,size] of [['caption',12],['body',14],['body-lg',16]]){
  const prop=`--practice-text-${token}`;let found=false;
  theme.walkDecls(prop,decl=>{found=true;if(decl.value!==`var(--account-practice-text-${token}, ${size}px)`)fail(paths.theme,`${prop} default must remain ${size}px`);});
  if(!found)fail(paths.theme,`missing ${prop}`);
 }
 for(const key of ['personal','owned','received','sort','shared']){
  const file=paths[key],ast=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const imports=new Map(),elements=[];
  function visit(node){
   if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)){
    const bindings=node.importClause?.namedBindings;
    if(bindings&&ts.isNamedImports(bindings))for(const item of bindings.elements)imports.set(item.name.text,{name:item.propertyName?.text??item.name.text,source:node.moduleSpecifier.text});
   }
   if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){
    const tag=node.tagName.getText(ast);elements.push({tag,node});
    if(['personal','owned','received'].includes(key)&&tag==='select'){
     // Personal assignment editor still uses native selects; catalog sorting may not.
     const text=node.attributes.getText(ast);
     if(key!=='personal'||/sort|setSort/i.test(text))fail(file,'catalog sorting must use CollectionSortControl, not native select');
    }
    for(const attr of node.attributes.properties){
     if(ts.isJsxAttribute(attr)&&attr.name.text==='style'&&attr.initializer){
      const expression=ts.isJsxExpression(attr.initializer)?attr.initializer.expression:null;
      if(!expression||!ts.isObjectLiteralExpression(expression)){fail(file,'inline style must be an inspectable object with layout properties only');continue;}
      for(const property of expression.properties){
       if(!ts.isPropertyAssignment(property)){fail(file,'inline style spreads/computed styles are not allowed');continue;}
       const name=property.name.getText(ast).replace(/["']/g,'');
       if(/^(font|color|background|fill|stroke|lineHeight|letterSpacing)/.test(name))fail(file,`inline ${name} bypasses semantic collection typography/colors`);
      }
     }
    }
   }
   ts.forEachChild(node,visit);
  }visit(ast);
  const required=key==='sort'?['ActionMenu','@/components/practice/ui/ActionMenu']:key==='shared'?['SegmentedControl','@/components/practice/ui/SegmentedControl']:['CollectionSortControl','@/components/library/organization/CollectionSortControl'];
  const used=elements.filter(({tag})=>{const entry=imports.get(tag);return entry?.name===required[0]&&entry.source===required[1];});
  if(!used.length)fail(file,`must render shared ${required[0]} from ${required[1]}`);
  if(key==='shared')for(const {node} of used){if(!node.attributes.properties.some(attr=>ts.isJsxAttribute(attr)&&attr.name.text==='standard'&&(!attr.initializer||attr.initializer.getText(ast)==='{true}')))fail(file,'Shared sections must use SegmentedControl standard');}
 }
 return errors;
}
export function collectLiteralStyles(sources){
 const counts={};
 for(const [file,source] of Object.entries(sources)){
  if(!file.endsWith('.css')||file===paths.theme)continue;
  postcss.parse(source,{from:file}).walkDecls(decl=>{
   if(decl.prop.startsWith('--'))return;
   const rest=decl.value.replace(/var\([^()]*\)/g,'');
   const rawTypography=(decl.prop==='font-size'&&/\d/.test(rest))||(decl.prop==='font-family'&&!/^\s*(?:inherit|var\(--[\w-]+\))\s*$/.test(decl.value))||(decl.prop==='font'&&/\d(?:px|rem|em|pt)/.test(rest));
   const rawColor= /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|lab|color)\s*\(/i.test(rest)||(/^(?:color|background-color|border-color|fill|stroke)$/.test(decl.prop)&&/\b(?:white|black|red|blue|green|gray|grey|yellow|orange|purple)\b/i.test(rest));
   if(!rawTypography&&!rawColor)return;
   const ancestry=[];let parent=decl.parent;
   while(parent&&parent.type!=='root'){ancestry.unshift(parent.type==='rule'?parent.selector:`@${parent.name} ${parent.params}`);parent=parent.parent;}
   const key=JSON.stringify([file,ancestry.join(' > '),decl.prop,decl.value]);counts[key]=(counts[key]??0)+1;
  });
 }
 return counts;
}
export const migratedStyleFiles=['components/onboarding/onboarding.module.css','components/releases/ReleaseUpdates.module.css'];
export function checkLiteralBaseline(sources,baseline){
 const errors=[];
 for(const key of Object.keys(baseline))if(migratedStyleFiles.includes(JSON.parse(key)[0]))errors.push(`Migrated stylesheet cannot be grandfathered: ${JSON.parse(key)[0]}`);
 for(const [key,count] of Object.entries(collectLiteralStyles(sources)))if(count>(baseline[key]??0))errors.push(`New literal style (${count} > ${baseline[key]??0} grandfathered): ${key}`);
 return errors;
}
function componentCss(root){
 const sources={};
 function walk(dir){for(const entry of readdirSync(resolve(root,dir),{withFileTypes:true})){const path=dir+'/'+entry.name;if(entry.isDirectory())walk(path);else if(path.endsWith('.css'))sources[path]=readFileSync(resolve(root,path),'utf8');}}
 walk('components');return sources;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
 const baselinePath=resolve(root,'scripts/interface-standard-baseline.json');
 const sources=componentCss(root);
 if(process.argv.includes('--write-baseline')){writeFileSync(baselinePath,JSON.stringify(collectLiteralStyles(sources),null,2)+'\n');console.log('Wrote reviewed legacy literal baseline. Do not regenerate it to hide regressions.');process.exit(0);}
 const errors=[...checkInterfaceStandard(path=>readFileSync(resolve(root,path),'utf8')),...checkLiteralBaseline(sources,JSON.parse(readFileSync(baselinePath,'utf8')))];
 if(errors.length){console.error('Interface standard failed:\n'+errors.map(error=>' - '+error).join('\n'));process.exitCode=1;}else console.log('Interface standard passed (bounded collection presentation checks).');
}
