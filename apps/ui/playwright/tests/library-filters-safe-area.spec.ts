import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {expect,test} from '@playwright/test';

// Emulated devices report zero env() insets. Resolve OS values in the shipped
// stylesheet to exercise native dialog centering inside the real safe rectangle.
// RootLayout imports globals.css, whose @tailwind base supplies the reset.
// Read the installed reset instead of approximating dialog/button/heading styles.
const resolvePackage=createRequire(`${process.cwd()}/package.json`);
const preflight=readFileSync(resolvePackage.resolve('tailwindcss/lib/css/preflight.css'),'utf8');
const css=readFileSync('components/practice/library/libraryFilters.module.css','utf8');
for(const device of [
 {name:'iPhone Pro portrait',width:402,height:874,top:62,bottom:34,left:0,right:0},
 {name:'iPhone Pro reduced viewport',width:402,height:740,top:62,bottom:34,left:0,right:0},
 {name:'short portrait',width:375,height:667,top:20,bottom:0,left:0,right:0},
 {name:'iPhone landscape',width:874,height:402,top:0,bottom:21,left:62,right:62},
])test(`${device.name}: library filters clear OS safe areas`,async({page})=>{
 await page.setViewportSize(device);
 await page.emulateMedia({reducedMotion:'reduce'});
 const insets:Record<string,number>={top:device.top,bottom:device.bottom,left:device.left,right:device.right};
 const resolved=css.replace(/env\(safe-area-inset-(top|bottom|left|right)(?:,\s*0px)?\)/g,(_,edge)=>`${insets[edge]}px`);
 await page.setContent(`<style>${preflight}${resolved}</style>
 <dialog class="dialog"><header class="header"><h2>Library filters</h2><button>Close</button></header>
 <div class="viewport"><div class="track"><div class="page">${'<p>Filter choice</p>'.repeat(100)}</div></div></div>
 <footer class="footer"><p class="count">100 entries</p><div class="actions"><button>Reset</button><button>Cancel</button><button>Show results</button></div></footer></dialog>`);
 await page.locator('dialog').evaluate((el:HTMLDialogElement)=>el.showModal());
 for(const locator of [page.locator('dialog'),page.getByRole('heading'),page.getByRole('button',{name:'Close'}),page.getByRole('button',{name:'Show results'})]){
  const box=(await locator.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(device.top);
  expect(box.y+box.height).toBeLessThanOrEqual(device.height-device.bottom);
  expect(box.x).toBeGreaterThanOrEqual(device.left);
  expect(box.x+box.width).toBeLessThanOrEqual(device.width-device.right);
 }
 await page.getByRole('button',{name:'Show results'}).evaluate(el=>el.addEventListener('click',()=>el.closest('dialog')!.close()));
 await page.getByRole('button',{name:'Show results'}).click();
 await expect(page.locator('dialog')).not.toBeVisible();
});
