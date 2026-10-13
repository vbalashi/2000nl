import { test, expect } from "@playwright/test";
import { buildSync } from "esbuild";

// Isolated geometry gate: real hook + production face grid, no backend/auth needed.
const bundle = buildSync({
  stdin: { contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {useTrainingFaceFit} from './components/training/useTrainingFaceFit';
    import styles from './components/training/approvedTrainingCard.module.css';
    function Fixture() {
      const fit = useTrainingFaceFit('fixture');
      return <div ref={fit.viewport} id="viewport" onScroll={fit.updateScroll} style={{height:'100%',overflow:'auto'}}>
        <div ref={fit.layout} className={styles.faceLayout}>
          <div className={styles.facePrelude}><span>Recall the Dutch word</span></div>
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

test('fits the definition and hint into bounded card height', async ({page}) => {
  await mount(page, 'een reizende gelegenheid om plezier te maken, met bijv. bewegende apparaten waarin je kunt zitten en spellen waarbij je prijzen kunt winnen', 650, 500);
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
