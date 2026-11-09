import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import postcss from 'postcss';
import {resolve} from 'node:path';
const css=(path:string)=>readFileSync(resolve('components',path),'utf8');
describe('search boundary ownership',()=>{
 it('uses a single boundary when the shared search surface is focused',()=>{
  const root=postcss.parse(css('practice/ui/searchField.module.css'));
  const focus=root.nodes.find(node=>node.type==='rule'&&node.selector==='.field:focus-within');
  expect(focus?.type).toBe('rule');
  if(focus?.type==='rule')expect(focus.nodes.filter(node=>node.type==='decl'&&node.prop==='outline').map(node=>node.type==='decl'?node.value:'')).toEqual(['none']);
 });
 it('gives received groups the same three-column row structure as collections',()=>{
  const source=readFileSync(resolve('components/library/sharing/SharedLabelGroups.tsx'),'utf8');
  expect(source).toContain('s.receivedGroupRow');
  expect(css('library/organization/organization.module.css')).toMatch(/\.sharedGroups \.receivedGroupRow,\.received \.collection\{[^}]*grid-template-columns:20px minmax\(0,1fr\) 44px/);
 });
});
