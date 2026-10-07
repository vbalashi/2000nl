import {expect,test} from "@playwright/test";
for (const width of [320,390,768]) {
 test(`long headwords fit consistently on both sides at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1100});
  await page.goto('/dev/headword-fit');await page.evaluate(()=>document.fonts.ready);
  for(const mode of ['plain','syllables']){
   if(mode==='syllables')await page.getByRole('button',{name:'Toggle syllables',exact:true}).click();
   await expect(page.locator('h2').first()).toHaveAttribute('data-headword-fit',/single-line|wrap/);
   const results=await page.locator('[data-fit-case]').evaluateAll(nodes=>nodes.map(el=>{
    const word=el.querySelector('h2')!,row=word.parentElement!;
    return {name:el.getAttribute('data-fit-case')!,size:parseFloat(getComputedStyle(word).fontSize),fit:word.getAttribute('data-headword-fit'),height:word.getBoundingClientRect().height,width:word.getBoundingClientRect().width,available:row.clientWidth,stacked:row.getAttribute('data-article-stacked')};
   }));
   for(const item of results){
    expect(item.width).toBeLessThanOrEqual(item.available+1);
    expect(item.size).toBeGreaterThanOrEqual(20);
    if(item.fit==='single-line')expect(item.height).toBeLessThanOrEqual(item.size*1.15);
    else expect(item.height).toBeLessThanOrEqual(item.size*2.15);
   }
   // Both long words use the same layout and size on Face and Answer.
   for(const index of [0,2]){
    expect(results[index].fit).toBe(results[index+1].fit);
    expect(results[index].size).toBeCloseTo(results[index+1].size,1);
   }
   if(width===390){expect(results[0].fit).toBe('single-line');expect(results[0].stacked).toBe('true');}
  }
 });
}
