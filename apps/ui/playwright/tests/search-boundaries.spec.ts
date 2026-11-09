import {test,expect} from '@playwright/test';
for(const width of [390,1200])for(const colorScheme of ['light','dark'] as const)test(`search fields have one focused boundary ${width} ${colorScheme}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await page.emulateMedia({colorScheme});
 await page.goto('/dev/search-boundary-preview');
 await page.getByRole('button',{name:`Use ${colorScheme} theme`}).click();
 const fields=page.getByTestId('search-boundary-preview').locator('input');expect(await fields.count()).toBe(10);
 for(const input of await fields.all()){
  await input.focus();
  const rings=await input.evaluate(element=>{
   const parent=element.parentElement!;
   const elements=parent.tagName==='LABEL'||parent.className.includes('searchField_')?[element,parent]:[element];
   return elements.map(node=>{const s=getComputedStyle(node);return Number.parseFloat(s.borderTopWidth)>0&&s.borderTopStyle!=='none'?1:0;}).reduce<number>((a,b)=>a+b,0)+elements.filter(node=>{const s=getComputedStyle(node);return s.outlineStyle!=='none'&&Number.parseFloat(s.outlineWidth)>0&&Number.parseFloat(s.outlineOffset)>=0;}).length;
  });
  expect(rings,await input.getAttribute('aria-label')??'search').toBeLessThanOrEqual(1);
 }
});

for(const width of [350,390,1200])test(`received group and collection align ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('/dev/search-boundary-preview');
 const names=await Promise.all(['333','firstXXX'].map(name=>page.getByRole('button',{name,exact:true}).boundingBox()));
 expect(Math.abs(names[0]!.x-names[1]!.x)).toBeLessThan(1);
 const actions=await Promise.all(['More actions: 333','More actions · firstXXX'].map(name=>page.getByRole('button',{name,exact:true}).boundingBox()));
 expect(Math.abs(actions[0]!.x+actions[0]!.width/2-actions[1]!.x-actions[1]!.width/2)).toBeLessThan(1);
});
