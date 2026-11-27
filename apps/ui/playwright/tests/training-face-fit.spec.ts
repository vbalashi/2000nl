import { test, expect } from "@playwright/test";
import { buildSync } from "esbuild";

// Isolated geometry gate: real hook + production face grid, no backend/auth needed.
const bundle = buildSync({
  stdin: { contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {useTrainingFaceFit} from './components/training/useTrainingFaceFit';
    import styles from './components/training/approvedTrainingCard.module.css';
    import theme from './components/practice/ui/practiceTheme.module.css';
    function Fixture() {
      const fit = useTrainingFaceFit('fixture');
      return <div ref={fit.viewport} id="viewport" className={theme.theme} onScroll={fit.updateScroll} style={{height:'100%',overflow:'auto'}}>
        <div ref={fit.layout} className={styles.faceLayout}>
          <div className={styles.facePrelude}><span>Recall the Dutch word</span>{window.recallText && <p data-face-fit id="recall" className={styles.recallTarget}>{window.recallText}</p>}</div>
          <div className={styles.facePrompt}><p data-face-fit id="text" style={{margin:0,maxWidth:'34rem',lineHeight:1.22}}>{window.fixtureText}</p></div>
          <aside className={styles.faceHint} data-visible="true"><p data-face-fit id="hint" style={{margin:0}}>Hint · example: a helpful sentence.</p></aside>
        </div>
        <span id="state" data-bottom={fit.scroll.bottom} />
      </div>;
    }
    createRoot(document.getElementById('root')).render(<Fixture/>);
  `, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, write: false, outdir: "/tmp/2000nl-face-fit-test", platform: "browser",
  loader: { ".css": "local-css" }, define: { "process.env.NODE_ENV": '"production"' },
});
const js = bundle.outputFiles.find(file => file.path.endsWith('.js'))!.text;
const css = bundle.outputFiles.find(file => file.path.endsWith('.css'))!.text;

async function mount(page: import('@playwright/test').Page, text: string, width: number, height: number) {
  await page.setViewportSize({width: Math.max(width, 400), height: Math.max(height, 600)});
  await page.setContent(`<style>*{box-sizing:border-box}body{margin:0}#text{font-size:var(--size);min-width:0}#hint{font-size:24px}#root{width:${width}px;height:${height}px;--size:52px}${css}</style><div id="root"></div>`);
  await page.evaluate(value => { (window as unknown as {fixtureText:string}).fixtureText = value; }, text);
  await page.addScriptTag({content: js});
  await expect(page.locator('#text')).toBeVisible();
}

test('shrinks a long mobile word before splitting it, and restores preferred size on growth', async ({page}) => {
  await mount(page, 'Преподавательница', 340, 650);
  await expect.poll(() => page.locator('#text').evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeLessThan(52);
  const metrics = await page.locator('#text').evaluate(node => ({height:node.clientHeight,size:parseFloat(getComputedStyle(node).fontSize),width:node.scrollWidth,available:node.clientWidth}));
  expect(metrics.size).toBeGreaterThanOrEqual(22);
  expect(metrics.height).toBeLessThan(metrics.size * 1.3);
  expect(metrics.width).toBeLessThanOrEqual(metrics.available + 1);
  await page.locator('#root').evaluate(node => {node.style.width='900px';});
  await expect.poll(() => page.locator('#text').evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBe(52);
  await page.locator('#root').evaluate(node => {node.style.setProperty('--size','40px');});
  await expect.poll(() => page.locator('#text').evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBe(40);
});

test('fits the screenshot recall word on one line within the readable floor', async ({page}) => {
  await mount(page, 'путешествовать', 300, 650);
  const text = page.locator('#text');
  await expect.poll(() => text.evaluate(el => {
    const style = getComputedStyle(el);
    return el.getBoundingClientRect().height / parseFloat(style.lineHeight);
  })).toBeLessThan(1.1);
  expect(await text.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(22);
});

test('fits the definition and hint into bounded card height', async ({page}) => {
  await mount(page, 'een tijdelijk evenement op een groot plein, waar bezoekers rondlopen langs kleurrijke attracties, kraampjes met warme snacks, spelletjes om samen te spelen en draaiende ritten voor kinderen en volwassenen', 650, 500);
  await expect.poll(() => page.locator('#text').evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeLessThan(52);
  expect(await page.locator('#viewport').evaluate(node => node.scrollHeight - node.clientHeight)).toBeLessThanOrEqual(1);
  expect(await page.locator('#hint').evaluate(node => node.getBoundingClientRect().bottom)).toBeLessThanOrEqual(500);
});

test('keeps readable floor and signals remaining scroll for excessive content', async ({page}) => {
  await mount(page, 'An exceptionally long definition with many words. '.repeat(80), 340, 400);
  await expect.poll(() => page.locator('#text').evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBe(22);
  await expect(page.locator('#state')).toHaveAttribute('data-bottom','true');
  await page.locator('#viewport').evaluate(node => {node.scrollTop=node.scrollHeight;});
  await expect(page.locator('#state')).toHaveAttribute('data-bottom','false');
});

test('keeps a long recall translation whole and visually subordinate to its context', async ({page}) => {
  await page.setViewportSize({width: 400, height: 800});
  await page.setContent(`<style>*{box-sizing:border-box}body{margin:0}#root{width:340px;height:650px;--practice-font-reading:Georgia;--account-practice-text-title:32px;--practice-text:black;--practice-text-secondary:gray;--practice-text-label:14px;--practice-font-ui:sans-serif}#text{font-size:38.4px}#hint{font-size:20px}${css}</style><div id="root"></div>`);
  await page.evaluate(() => { Object.assign(window, {recallText:'прохладительный напиток · газировка', fixtureText:'Хочешь стаканчик газировки или пива?'}); });
  await page.addScriptTag({content: js});
  const target = page.locator('#recall');
  await expect(target).toBeVisible();
  await expect.poll(async () => (await target.evaluate(el => parseFloat(getComputedStyle(el).fontSize))) / (await page.locator('#text').evaluate(el => parseFloat(getComputedStyle(el).fontSize)))).toBeLessThan(1);
  const metrics = await target.evaluate(el => ({width:el.scrollWidth, available:el.clientWidth}));
  expect(metrics.width).toBeLessThanOrEqual(metrics.available + 1);
});
