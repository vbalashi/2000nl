import {readFileSync} from 'node:fs';
import {expect,test} from '@playwright/test';
import {textSizeStyles,textSizes} from '../../lib/reading/textScale';

// Real browser cascade and custom properties: jsdom cannot resolve these sizes.
test('note translations match their sources across reading scales and nesting',async({page})=>{
  const css=readFileSync('components/practice/article/articleContent.module.css','utf8');
  const pair=(kind:string)=>`<div data-kind="${kind}"><div class="contentPair"><p class="${kind==='example'?'literary':'explanation'}">Source</p><div data-open="true" aria-hidden="false"><div><p class="translation" data-content-translation>Translation</p></div></div></div></div>`;
  for(const size of textSizes){
   const vars=Object.entries(textSizeStyles(size.id)).map(([k,v])=>`${k}:${v}`).join(';');
   for(const nesting of ['paired','literary','tiles']){
    await page.setContent(`<style>${css}</style><div class="detail" data-nested-reading="${nesting}" style="${vars}">${pair('usage-note')}<div class="children">${pair('usage-note')}<div class="children">${pair('usage-note')}</div></div>${pair('example')}</div>`);
    const sizes=await page.locator('.contentPair').evaluateAll(pairs=>pairs.map(pair=>Array.from(pair.querySelectorAll('p')).map(p=>getComputedStyle(p).fontSize)));
    for(const [index,values] of sizes.slice(0,3).entries())expect(values[0],`${size.id}/${nesting}/depth${index}`).toBe(values[1]);
    expect(sizes[3][0],`${size.id}: example hierarchy`).not.toBe(sizes[3][1]);
   }
  }
});
