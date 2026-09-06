// Reproducible local-only capture. Uses the repo's already-installed Playwright.
// Run: node docs/design/training-height-2026-09/capture.cjs
const { chromium } = require('../../../apps/ui/node_modules/playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const base = 'http://127.0.0.1:3100';
const out = path.join(__dirname, 'assets');
const sizes = { phone: [390, 844], tablet: [834, 1112], desktop: [1440, 960] };

(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const evidence = { sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: __dirname, encoding: 'utf8' }).trim(), cases: [], blockedRequests: [] };
  try {
    for (const [device, [width, height]] of Object.entries(sizes)) {
      for (const variant of ['full', 'inset']) {
        const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: 'dark', reducedMotion: 'reduce', serviceWorkers: 'block' });
        await context.route('**/*', async route => {
          const url = new URL(route.request().url());
          if (url.origin !== base || url.pathname.startsWith('/api/')) {
            evidence.blockedRequests.push({ origin: url.origin, pathname: url.pathname });
            return route.abort();
          }
          return route.continue();
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const url = new URL('/dev/sense-card-gate', base);
        url.search = new URLSearchParams({ prototype: 'height', canvas: '1', variant, device, theme: 'dark', side: 'answer', content: 'short' }).toString();
        await page.goto(url.href, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        await page.locator('html.dark').waitFor();
        const geometry = await page.evaluate(() => {
          const rect = selector => {
            const r = document.querySelector(selector).getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom };
          };
          return {
            viewport: { width: innerWidth, height: innerHeight },
            document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
            card: rect('[data-testid="training-sense-card-shell"]'),
            dock: rect('[data-testid="training-sense-card-dock"]'),
            footer: rect('main > footer'),
            fonts: Array.from(document.fonts).filter(f => f.status === 'loaded').map(f => ({ family: f.family, style: f.style })),
          };
        });
        assert.deepEqual(geometry.viewport, { width, height });
        assert.deepEqual(geometry.document, { width, height }, 'Outer document must not overflow');
        assert.equal(geometry.card.width, device === 'phone' ? 358 : 760);
        assert.equal(geometry.card.height, device === 'phone' ? 534 : height - (variant === 'full' ? 270 : 326));
        assert.ok(geometry.dock.bottom <= geometry.footer.y, 'All action controls must fit above footer');
        assert.ok(geometry.fonts.some(f => f.family.includes('Newsreader') && f.style === 'italic'));
        assert.ok(geometry.fonts.some(f => f.family.includes('Newsreader') && f.style === 'normal'));
        assert.ok(geometry.fonts.some(f => f.family.includes('Inter')));
        await page.screenshot({ path: path.join(out, `${device}-${variant}-answer-dark.png`) });

        // Same viewport/layout in light mode, not a CSS recoloring of the screenshot.
        url.searchParams.set('theme', 'light');
        await page.goto(url.href, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        await page.locator('html:not(.dark)').waitFor();
        await page.screenshot({ path: path.join(out, `${device}-${variant}-answer-light.png`) });

        // Long content: real continuation action; pinned headword and dock must not move.
        url.searchParams.set('theme', 'dark');
        url.searchParams.set('content', 'long');
        await page.goto(url.href, { waitUntil: 'networkidle' });
        const word = page.getByTestId('sense-card-headword-lockup');
        const scroll = page.getByTestId('training-answer-scroll');
        const before = { word: await word.boundingBox(), dock: await page.getByTestId('training-sense-card-dock').boundingBox() };
        await page.getByRole('button', { name: 'Meer kaartinhoud tonen', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('[data-testid="training-answer-scroll"]').scrollTop > 10);
        // Capture the final scroll position, not an intermediate animation frame.
        await scroll.evaluate(el => new Promise(resolve => {
          let previous = el.scrollTop;
          let stableFrames = 0;
          const check = () => {
            stableFrames = el.scrollTop === previous ? stableFrames + 1 : 0;
            previous = el.scrollTop;
            if (stableFrames >= 6) resolve();
            else requestAnimationFrame(check);
          };
          requestAnimationFrame(check);
        }));
        const after = { word: await word.boundingBox(), dock: await page.getByTestId('training-sense-card-dock').boundingBox() };
        assert.deepEqual(after, before, 'Reading scroll must not move headword or dock');
        assert.equal(await scroll.getAttribute('data-scroll-top'), 'faded');
        const scrollProof = await scroll.evaluate(el => ({ top: el.scrollTop, height: el.clientHeight, scrollHeight: el.scrollHeight }));
        await page.screenshot({ path: path.join(out, `${device}-${variant}-scrolled-dark.png`) });

        // Face and translation use real component controls, still no learning mutation.
        url.searchParams.set('side', 'face');
        url.searchParams.set('content', 'short');
        await page.goto(url.href, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: path.join(out, `${device}-${variant}-face-dark.png`) });
        await page.getByRole('button', { name: 'Antwoord tonen', exact: true }).click();
        await page.getByRole('button', { name: 'Vertalen', exact: true }).click();
        await page.getByTestId('entry-translation').waitFor({ state: 'visible' });
        assert.equal(await page.getByTestId('training-sense-card-stage').getAttribute('data-side'), 'answer');
        assert.deepEqual(errors, []);
        evidence.cases.push({ device, variant, geometry, scrollProof, faceAnswerTranslation: 'passed', errors });
        await context.close();
        console.log(`${device} ${variant}: geometry, real fonts, scroll, Face/Answer, translation passed`);
      }
    }
    await fs.writeFile(path.join(__dirname, 'capture-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
