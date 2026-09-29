// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import {expect,test} from 'vitest';
const root=postcss.parse(fs.readFileSync(path.resolve('components/practice/ui/practiceTheme.module.css'),'utf8'));
function palette(name:string,dark:boolean){const tokens:Record<string,string>={};root.walkRules(rule=>{
 if(!rule.selector.startsWith('.theme')||rule.selector.includes(' ')||rule.parent?.type==='atrule')return;
 const selected=rule.selector.match(/data-practice-palette=(\w+)/)?.[1];
 if(selected&&selected!==name||rule.selector.includes('data-colour-mode=dark')&&!dark)return;
 rule.walkDecls(decl=>{if(decl.prop.startsWith('--practice-'))tokens[decl.prop.slice(11)]=decl.value;});
 });return tokens;}
function luminance(hex:string){const values=hex.slice(1).match(/../g)!.slice(0,3).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return values[0]*.2126+values[1]*.7152+values[2]*.0722;}
function contrast(a:string,b:string){const values=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (values[0]+.05)/(values[1]+.05);}
for(const name of ['lavender','blue','graphite'])for(const dark of [false,true]){
 test(`${name} ${dark?'dark':'light'}: text roles meet AA on their supported surfaces`,()=>{
  const p=palette(name,dark);
  for(const ink of ['text','text-secondary','text-muted'])for(const surface of ['canvas','surface','surface-subtle','surface-hover','hero','hero-end'])expect(contrast(p[ink],p[surface]),`${ink} on ${surface}`).toBeGreaterThanOrEqual(4.5);
  for(const ink of ['danger','warning','success','info']) expect(contrast(p[ink],p['surface-hover']),`${ink} rating on hover`).toBeGreaterThanOrEqual(4.5);
  for(const [ink,bg] of [['on-accent','accent'],['on-accent','accent-hover'],['selected-text','selected'],['success','success-soft'],['warning','warning-soft'],['danger','danger-soft'],['info','info-soft']])expect(contrast(p[ink],p[bg]),`${ink} on ${bg}`).toBeGreaterThanOrEqual(4.5);
 });
 test(`${name} ${dark?'dark':'light'}: focus visible on canvas and panels`,()=>{const p=palette(name,dark);for(const surface of ['canvas','surface','hero'])expect(contrast(p.focus,p[surface])).toBeGreaterThanOrEqual(3);});
}
