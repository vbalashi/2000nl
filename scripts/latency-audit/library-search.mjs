import fs from "node:fs";
import { openAuthed, visibleButtons, OUT } from "./lib.mjs";

const { browser, page, net } = await openAuthed();
await page.reload({ waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: /^Library$/ }).click();
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/library.png` });
console.log((await visibleButtons(page)).slice(0, 60).join("\n"));
console.log(JSON.stringify(await page.$$eval("input, textarea", (els) => els.map((e) => ({ type: e.type, ph: e.placeholder, aria: e.getAttribute("aria-label"), name: e.name })))));

const input = page.getByRole("textbox", {name: /Search words|Поиск слов|Woorden zoeken/i});
const mark = net.length;
const t0 = Date.now();
await input.pressSequentially("huis", { delay: 120 });
const tTyped = Date.now();
await page.waitForLoadState("networkidle").catch(() => null);
await page.waitForTimeout(1500);
console.log(`typed ${tTyped - t0}ms; settle ${Date.now() - tTyped}ms`);
const reqs = net.slice(mark);
for (const r of reqs) console.log(r.method, r.path, r.rpc ?? "", r.status, Math.round(r.totalMs), r.serverTiming ?? "");
await page.screenshot({ path: `${OUT}/library-search.png` });
console.log((await visibleButtons(page)).slice(0, 60).join("\n"));
fs.writeFileSync(`${OUT}/library-explore.json`, JSON.stringify(reqs, null, 2));
await browser.close();
