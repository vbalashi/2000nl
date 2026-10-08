import fs from "node:fs";
import { openAuthed, visibleButtons, OUT } from "./lib.mjs";

const N = Number(process.argv[2] ?? 20);
const dwells = (process.argv[3] ?? "500,5000,15000").split(",").map(Number);
const label = process.argv[4] ?? "desktop";
const mobile = label.startsWith("mobile");
const outFile = `${OUT}/${label}-${Date.now()}.jsonl`;
const emit = (rec) => fs.appendFileSync(outFile, JSON.stringify(rec) + "\n");

const { browser, page, net } = await openAuthed({ mobile });
const startBtn = () => page.getByRole("button", { name: /^(Start current setup|Start training|Training starten|Continue training|Начать тренировку|Продолжить тренировку)$/i });
const ready = page.locator('[data-training-v2-state="ready"]').first();

async function startSession(kind) {
  await startBtn().waitFor({ timeout: 30000 });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((x) => /^(Start current setup|Start training|Training starten|Continue training|Начать тренировку|Продолжить тренировку)$/i.test((x.textContent || "").trim()) && !x.disabled), null, { timeout: 60000 });
  const netMark = net.length;
  const timingMark = await page.evaluate(() => window.__lat.timings.length);
  const ts = Date.now();
  await startBtn().click();
  await ready.waitFor({ timeout: 60000 });
  const ms = Date.now() - ts;
  await page.waitForTimeout(1500);
  const events = await page.evaluate((mark) => window.__lat.timings.slice(mark), timingMark);
  emit({ type: "start", kind, ms, clickedAtMs: ts, readyAtMs: ts + ms, events, net: net.slice(netMark) });
  console.log(`${kind} start: click→first card ${ms}ms`);
}

try {
  const tLoad = Date.now();
  await page.goto("https://2000.dilum.io/?destination=training", { waitUntil: "domcontentloaded" });
  await startBtn().waitFor({ timeout: 30000 });
  emit({ type: "load", toStartVisibleMs: Date.now() - tLoad, net: net.slice() });
  await startSession("initial");

  let answered = 0;
  for (let i = 0; answered < N && i < N * 2; i++) {
    const dwell = dwells[answered % dwells.length];
    await page.waitForTimeout(dwell);
    const show = page.getByRole("button", { name: /Antwoord Tonen|Показать ответ|Show answer/i });
    if (await show.isVisible().catch(() => false)) {
      await show.click();
      await page.waitForTimeout(300);
    }
    const learn = page.getByRole("button", { name: /^(Begin met leren|Учить|Start learning|Learn|Leren)$/i }).first();
    const good = page.getByRole("button", { name: /^(Goed|Хорошо|Good)/i }).first();
    const back = page.getByRole("button", { name: /Back to (Today|Training)|Вернуться к тренировке/i }).first();
    if (await back.isVisible().catch(() => false)) {
      await back.click();
      await startSession("restart");
      continue;
    }
    const before = await page.evaluate(() => window.__lat.timings.length);
    const netMark = net.length;
    if (await learn.isVisible().catch(() => false)) await learn.click();
    else if (await good.isVisible().catch(() => false)) await good.click();
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
    emit({ type: "answer", i: answered, dwell, total: done?.durationMs, outcome: done?.outcome ?? "timeout", events, net: net.slice(netMark) });
    console.log(`#${answered} dwell=${dwell} total=${done?.durationMs ?? "?"} ${done?.outcome ?? "timeout"} renew=${events.some((e) => e.outcome === "renewal-required")}`);
  }
} finally {
  await browser.close();
}
