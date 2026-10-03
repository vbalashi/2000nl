// Isolated visual fixtures; no auth, API calls, or progress writes.
import { chromium } from "playwright";
import fs from "node:fs";
const out = process.env.RHYTHM_OUTPUT || "../../docs/design/565-article-rhythm";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
const results = [];
await page.route("**/*", route => {
  const url = new URL(route.request().url());
  return url.origin === "http://localhost:3111" && !url.pathname.startsWith("/api/")
    ? route.continue() : route.abort();
});
for (const fixture of ["goed", "usage"])
for (const width of [390, 695])
for (const size of ["normal", "extra"])
for (const profile of ["balanced", "airy"])
for (const translation of ["off", "on", "partial"]) {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`http://localhost:3111/dev/article-rhythm?fixture=${fixture}&width=${width}&size=${size}&profile=${profile}&translation=${translation}&treatment=proposed`);
  await page.locator('[data-content-node-id]').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(650);
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  const geometry = await page.evaluate(() => {
    const visible = el => el && !el.closest('[aria-hidden=true]') && el.getBoundingClientRect().height > 0;
    const textLeft = el => {
      const range = document.createRange(); range.selectNodeContents(el);
      return range.getBoundingClientRect().left;
    };
    const nodes = [...document.querySelectorAll('[data-content-node-id]')].map(node => {
      const pair = node.firstElementChild;
      const source = pair.querySelector(':scope > p:not([data-content-translation])');
      const translated = pair.querySelector('[data-content-translation]');
      const role = pair.querySelector(':scope > [data-role]');
      const section = node.closest('[data-section]');
      const heading = role ?? (node.dataset.parentContentNodeId ? null : section?.querySelector(':scope > h3'));
      const headerLeft = visible(heading) ? heading.getBoundingClientRect().left : null;
      return {
        kind: node.dataset.kind, id: node.dataset.contentNodeId,
        nested: !!node.dataset.parentContentNodeId,
        sourceLeft: textLeft(source),
        headerLeft,
        inset: headerLeft === null ? null : textLeft(source) - headerLeft,
        translationAlignment: visible(translated) ? textLeft(translated) - textLeft(source) : null,
        leading: getComputedStyle(source).lineHeight,
      };
    });
    const relations = [...document.querySelectorAll('[data-kind=synonyms],[data-kind=antonyms]')].map(group => {
      const heading = group.querySelector('h3'), body = group.querySelector(':scope > p');
      return { kind: group.dataset.kind, inset: textLeft(body) - heading.getBoundingClientRect().left,
        leading: getComputedStyle(body).lineHeight };
    });
    const clipped = [...document.querySelectorAll('[data-content-translation]')].filter(visible).filter(el => {
      const reveal = el.closest('[aria-hidden=false]');
      return reveal && reveal.getBoundingClientRect().height < el.getBoundingClientRect().height - 1;
    }).length;
    return { nodes, relations, clipped, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  if (geometry.overflow || geometry.clipped) throw new Error(`Clipping/overflow: ${fixture}/${width}/${size}/${profile}/${translation}`);
  if (geometry.nodes.some(n => n.nested && n.inset !== null && Math.abs(n.inset - 8) > .5)) throw new Error('Nested inset lost');
  if (geometry.nodes.some(n => n.translationAlignment !== null && Math.abs(n.translationAlignment) > .5)) throw new Error('Translation alignment lost');
  if ([...geometry.nodes, ...geometry.relations].some(n => n.inset !== null && n.inset <= 0)) throw new Error('Section hierarchy lost');
  if (fixture === 'goed' && !['synonyms', 'antonyms'].every(kind => geometry.relations.some(r => r.kind === kind))) throw new Error('Missing relation coverage');
  if (fixture === 'usage' && !geometry.nodes.some(n => n.kind === 'usage-pattern')) throw new Error('Missing usage coverage');
  results.push({ fixture, width, size, profile, translation, ...geometry });
  if (width === 390 && size === 'normal' && profile === 'balanced') await page.screenshot({path:`${out}/coverage-${fixture}-${translation}.png`,fullPage:true});
}
fs.writeFileSync(`${out}/coverage.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify({ cases: results.length, overflow: 0, clipped: 0 }));
await browser.close();
