import fs from "node:fs";
import { openAuthed, visibleButtons, OUT } from "../../../../scripts/latency-audit/lib.mjs";

const { browser, page, net } = await openAuthed();
await page.reload({ waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: /^Library$/ }).click();
const input = page.getByRole("textbox", {name: /Search words|Поиск слов|Woorden zoeken/i});
await input.waitFor();
await input.fill("huis");
await page.getByRole("button", {name: /^het huis.*VanDale Dutch/i}).first().click();
await page.getByRole("button", { name: /Collections/ }).first().waitFor({ timeout: 20000 });
await page.waitForTimeout(1500);
const results = [];
const picker = page.getByRole("dialog").last();
const measure = async (name, fn, doneFn) => {
  const mark = net.length;
  const t0 = Date.now();
  await fn();
  await doneFn();
  const ms = Date.now() - t0;
  await page.waitForTimeout(1200);
  const reqs = net.slice(mark).map((r) => ({ m: r.method, p: r.rpc ?? r.path, ms: Math.round(r.totalMs), st: r.serverTiming }));
  results.push({ name, ms, reqs });
  console.log(`${name}: ${ms}ms; requests=${reqs.length}`);
  for (const r of reqs) console.log(`   ${r.m} ${r.p} ${r.ms}ms ${r.st ?? ""}`.slice(0, 200));
};
await page.getByRole("button", { name: /Collections/ }).first().click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/collections.png` });
console.log((await visibleButtons(page)).join(" | "));
const toggles = page.locator('[role="dialog"] button, [role="dialog"] [role="checkbox"], [role="dialog"] input[type=checkbox]');
console.log("dialog controls:", await toggles.count());
const dialogIdle = () => page.waitForFunction(() => {
  const d = [...document.querySelectorAll('dialog[open], [role="dialog"]')].pop();
  return d && ![...d.querySelectorAll("button,input")].some((b) => b.disabled && !/Create/i.test(b.textContent || "")) && !/Saving|Opslaan…|Bezig/i.test(d.textContent || "");
}, null, { timeout: 30000 });
const nameInput = page.getByPlaceholder("New collection name");
if (!(await picker.getByText("latency-audit", { exact: true }).count())) {
  await nameInput.fill("latency-audit");
  await measure("create collection + add word", () => page.getByRole("button", { name: /^Create$/ }).click(),
    () => picker.getByText("latency-audit", { exact: true }).first().waitFor({ timeout: 30000 }).then(dialogIdle));
}
const listBtn = picker.getByText("latency-audit", { exact: true }).first();
for (let k = 1; k <= 4; k++) {
  await measure(`toggle list #${k}`, () => listBtn.click(), dialogIdle);
}
await page.screenshot({ path: `${OUT}/collections-after.png` });
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
fs.writeFileSync(`${OUT}/library-actions.json`, JSON.stringify(results, null, 2));
await browser.close();
