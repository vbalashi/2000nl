// Usage: node scripts/qa-palette-outliers.mjs <training|session|answer|library|statistics> [width] [dark|light]
// Lists visible computed colours that are not practice palette tokens (local dev-login, RU QA account).
import { chromium } from "playwright";
const [,, screen = "training", width = "1024", scheme = "dark"] = process.argv;
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: +width, height: 900 }, colorScheme: scheme })).newPage();
await page.goto((process.env.QA_ORIGIN ?? "http://localhost:3100") + "/dev/test-login?redirectTo=/");
await page.waitForURL(u => !u.pathname.startsWith("/dev/test-login"), { timeout: 30000 });
await page.waitForTimeout(5000);
const nav = async name => {
  if (+width >= 768) await page.getByRole("navigation").getByRole("button", { name }).click();
  else { await page.locator("header button[aria-haspopup], header button[aria-expanded]").first().click(); await page.getByRole("button", { name }).last().click(); }
  await page.waitForTimeout(3500);
};
if (screen === "statistics") await nav("Статистика");
if (screen === "library") { await nav("Библиотека"); await page.locator("main input:visible").first().fill("nummer"); await page.waitForTimeout(4000);
  if (+width < 1024) { await page.locator("main :is(button,a,[role=button],li):has-text('3 значения')").first().click(); await page.waitForTimeout(3000); } }
if (screen === "session" || screen === "answer") {
  await page.getByRole("button", { name: /Начать тренировку|Продолжить тренировку/ }).first().click(); await page.waitForTimeout(3500);
  if (screen === "answer") { await page.getByRole("button", { name: "Показать ответ" }).click(); await page.waitForTimeout(1500); }
}
const report = await page.evaluate(() => {
  const theme = document.querySelector("[class*=practiceTheme_theme]") ?? document.body;
  const probe = document.createElement("span"); theme.appendChild(probe);
  const tokens = new Set();
  const style = getComputedStyle(theme);
  for (const sheet of document.styleSheets) { let rules; try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of rules) { const text = rule.cssText; for (const m of text.matchAll(/--practice-[a-z0-9-]+/g)) {
      const v = style.getPropertyValue(m[0]).trim(); if (!v || !/^#|rgb/.test(v)) continue;
      probe.style.color = v; tokens.add(getComputedStyle(probe).color.replace(/\s/g, "")); } } }
  probe.remove();
  const base = c => c.replace(/\s/g, "").replace(/^rgba\((\d+,\d+,\d+),[\d.]+\)$/, "rgb($1)");
  const known = new Set([...tokens].map(base));
  const out = new Map();
  for (const el of document.querySelectorAll("main *, header *, [role=dialog] *")) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
    const cs = getComputedStyle(el); if (cs.visibility === "hidden" || +cs.opacity === 0) continue;
    const text = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    const checks = [["bg", cs.backgroundColor], ["border", cs.borderTopWidth !== "0px" ? cs.borderTopColor : ""], ...(text ? [["color", cs.color]] : [])];
    for (const [kind, value] of checks) {
      if (!value || /rgba\(0, 0, 0, 0\)|transparent/.test(value)) continue;
      if (known.has(base(value))) continue;
      const key = `${kind} ${value}`; const list = out.get(key) ?? [];
      if (list.length < 3) list.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ").filter(c => /slate|indigo|emerald|rose|amber|bg-|text-|border-|_/.test(c)).slice(0, 4).join(".")} "${(el.textContent || "").trim().slice(0, 24)}"`);
      out.set(key, list);
    }
  }
  return { tokens: known.size, outliers: [...out].map(([k, v]) => ({ k, v })) };
});
console.log(JSON.stringify({ screen, width, scheme, ...report }, null, 1));
await browser.close();
