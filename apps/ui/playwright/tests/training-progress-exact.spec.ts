import {expect,test} from '@playwright/test';

test('phone-width finite plans preserve one dot per card and advance the thread together', async ({page})=>{
 await page.setViewportSize({width:441,height:900});
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/dev/sense-card-gate?prototype=progress-density');
 for(const completed of [6,7]){
  for(const total of [20,30,40,50]){
   const example=page.locator(`[data-density="${total}"]`);
   const progress=example.getByRole('progressbar');
   await expect(progress).toHaveAttribute('aria-valuenow',String(completed));
   await expect(progress).toHaveAttribute('aria-valuemax',String(total));
   if(total>30){
    await expect(progress).toHaveAttribute('data-variant','line');
    await expect(progress.locator('span')).toHaveCount(1);
    await expect.poll(()=>progress.locator('span').evaluate(el=>parseFloat(el.style.left))).toBeCloseTo(completed/(total-1)*100,3);
    continue;
   }
   await expect.poll(()=>progress.evaluate(el=>Array.from(el.querySelectorAll('span')).slice(0,-1).filter(mark=>Number(getComputedStyle(mark).opacity)>.3).length)).toBe(completed + 1);
   const geometry=await progress.evaluate(el=>{
    const marks=Array.from(el.querySelectorAll('span')).slice(0,-1);
    const activeMarks=marks.filter(mark=>Number(getComputedStyle(mark).opacity)>.3);
    const centers=marks.map(mark=>{const r=mark.getBoundingClientRect();return r.x+r.width/2});
    return {count:marks.length,active:activeMarks.length,runner:el.querySelectorAll('span')[marks.length].getBoundingClientRect().x,activeX:activeMarks.at(-1)?.getBoundingClientRect().x,thread:el.querySelector('polyline')?.getAttribute('points')?.split(' ').length,minGap:Math.min(...centers.slice(1).map((x,i)=>x-centers[i]))};
   });
   expect(geometry.count).toBe(total);
   expect(geometry.active).toBe(completed + 1);
   expect(geometry.runner).toBeCloseTo(geometry.activeX!, 1);
   expect(geometry.thread).toBe(completed + 1);
   expect(geometry.minGap).toBeGreaterThan(3);
  }
  if(completed===6)await page.getByRole('button',{name:'Следующая карточка',exact:true}).click();
 }
});
