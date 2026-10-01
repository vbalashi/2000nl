import fs from "node:fs";
import { openAuthed, visibleButtons, OUT } from "../../../../scripts/latency-audit/lib.mjs";

const N = Number(process.argv[2] ?? 20);
const dwells = (process.argv[3] ?? "500,5000,15000").split(",").map(Number);
const label = process.argv[4] ?? "desktop";
const mobile = label.startsWith("mobile");
const outFile = `${OUT}/${label}-${Date.now()}.jsonl`;
const emit = (rec) => fs.appendFileSync(outFile, JSON.stringify(rec) + "\n");

const { browser, page, net } = await openAuthed({ mobile });
page.on("request", request => {
  if (!request.url().endsWith("/rest/v1/rpc/start_training_session")) return;
  const p = request.postDataJSON();
  emit({type:"scope", listType:p.p_list_type, listSelected:Boolean(p.p_list_id), cardTypeIds:p.p_card_type_ids, cardFilter:p.p_card_filter, ratio:p.p_new_review_ratio, sessionSize:p.p_session_size});
});
const startBtn = () => page.getByRole("button", { name: /^(Start current setup|Start training|Continue training|Начать тренировку|Продолжить тренировку)$/i });
const ready = page.locator('[data-training-v2-state="ready"]').first();

async function startSession(kind) {
  await startBtn().waitFor({ timeout: 30000 });
  const enabledStart = () => [...document.querySelectorAll("button")].some((x) => /^(Start current setup|Start training|Continue training|Начать тренировку|Продолжить тренировку)$/i.test((x.textContent || "").trim()) && !x.disabled);
  await page.waitForFunction(enabledStart, null, {timeout: 5000}).catch(async () => {
    const adjust = page.getByRole("button", {name: /^(Adjust|Configure|Настроить|Aanpassen)$/i}).first();
    if (!await adjust.isVisible().catch(() => false)) throw new Error("No enabled start or setup action");
    await adjust.click();
  });
  await page.waitForFunction(enabledStart, null, {timeout: 60000});
  const netMark = net.length;
  const ts = Date.now();
  await startBtn().click();
  await ready.waitFor({ timeout: 60000 });
  const ms = Date.now() - ts;
  await page.waitForTimeout(1500);
  emit({ type: "start", kind, ms, net: net.slice(netMark) });
  console.log(`${kind} start: click→first card ${ms}ms`);
}

const tLoad = Date.now();
await page.reload({ waitUntil: "domcontentloaded" });
await startBtn().waitFor({ timeout: 30000 });
emit({ type: "load", toStartVisibleMs: Date.now() - tLoad, net: net.slice() });
await startSession("cold");

let answered = 0;
let reviewed = 0;
for (let i = 0; answered < N && i < N * 2; i++) {
  const dwell = dwells[answered % dwells.length];
  await page.waitForTimeout(dwell);
  const show = page.getByRole("button", { name: /Antwoord Tonen|Показать ответ|Show answer/i });
  if (await show.isVisible().catch(() => false)) {
    await show.click();
    await page.waitForTimeout(300);
  }
  const learn = page.getByRole("button", { name: /^(Begin met leren|Учить|Start learning|Learn|Leren)$/i }).first();
  const grades = [{name:"again",label:/^(Again|Opnieuw|Снова|Плохо)/i},{name:"hard",label:/^(Hard|Moeilijk|Трудно)/i},{name:"good",label:/^(Good|Goed|Хорошо)/i},{name:"easy",label:/^(Easy|Makkelijk|Легко)/i}];
  const grade = grades[reviewed % grades.length];
  const good = page.getByRole("button", { name: grade.label }).first();
  const back = page.getByRole("button", { name: /Back to (Today|Training)|Вернуться к тренировке/i }).first();
  if (await back.isVisible().catch(() => false)) {
    await back.click();
    await startSession("restart");
    continue;
  }
  const before = await page.evaluate(() => window.__lat.timings.length);
  const netMark = net.length;
  let action = null;
  if (await learn.isVisible().catch(() => false)) { action = "learn"; await learn.click(); }
  else if (await good.isVisible().catch(() => false)) { action = grade.name; reviewed++; await good.click(); }
  else {
    console.log("no answer control:", (await visibleButtons(page)).join(" | "));
    await page.screenshot({ path: `${OUT}/${label}-stuck-${i}.png` });
    break;
  }
  const done = await page
    .waitForFunction(
      (b) =>
        window.__lat.timings.slice(b).find((e) => e.stage === "transition.total") ||
        ([...document.querySelectorAll("button")].some((x) => /Back to (Today|Training)|Вернуться к тренировке/i.test(x.textContent || "")) && { outcome: "session-complete" }),
      before,
      { timeout: 30000 },
    )
    .then((h) => h.jsonValue())
    .catch(() => null);
  await page.waitForTimeout(200);
  const events = await page.evaluate((b) => window.__lat.timings.slice(b), before);
  answered++;
  emit({ type: "answer", i: answered, action, dwell, total: done?.durationMs, outcome: done?.outcome ?? "timeout", events, net: net.slice(netMark) });
  console.log(`#${answered} dwell=${dwell} total=${done?.durationMs ?? "?"} ${done?.outcome ?? "timeout"} renew=${events.some((e) => e.outcome === "renewal-required")}`);
}
await browser.close();
emit({type: "network-summary", net});
