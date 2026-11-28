import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { setupAuthenticatedTrainingAttributionPage } from '../support/trainingAttributionHarness';

test('iPhone training uses reclaimed bottom inset for card and controls @pilot', async ({page}) => {
  await page.setViewportSize({width:402,height:874});
  await page.emulateMedia({reducedMotion:'reduce'});
  await setupAuthenticatedTrainingAttributionPage(page, 0, {visualProfile:'answer'});
  await page.getByRole('button',{name:/^(Start training|Training starten|Начать тренировку)$/}).click();
  const stage=page.getByTestId('training-sense-card-stage');
  await expect(stage).toBeVisible();
  const frame=page.locator('[data-app-frame]');
  // Emulated browsers return a zero safe-area inset. Apply the actual mobile
  // rule with iPhone's 34px inset, preserving the layout and real card controls.
  const css=readFileSync('components/training/v2/TrainingSessionLayout.module.css','utf8');
  const rule=css.match(/@media\(max-width:700px\)\{\.main\.mainApproved\{[^}]+\}\}/)?.[0];
  if (!rule) throw new Error('Missing mobile training layout rule');
  await page.addStyleTag({content:rule.replace('.main.mainApproved','[data-training-session-main][data-training-session-main]').replace(/env\(safe-area-inset-(top|bottom|left|right),0px\)/g,(_,edge)=>edge==='bottom'?'34px':edge==='top'?'59px':'0px')});
  const card=page.getByTestId('training-card-frame');
  const show=page.getByRole('button',{name:/Antwoord tonen|Показать ответ|Show answer/i});
  const report=page.getByRole('button',{name:/^(Melden|Report|Сообщить)$/i});
  const known=page.getByRole('button',{name:/Mark(?:eer|eren) als bekend|Mark as known|Отметить как известное/i});
  await frame.evaluate(el=>(el as HTMLElement).style.setProperty('--app-bottom-reclaimed','0px'));
  await page.waitForTimeout(1200); // Let the session and card entrance settle.
  const before={card:(await card.boundingBox())!,show:(await show.boundingBox())!,report:(await report.boundingBox())!};
  await frame.evaluate(el=>(el as HTMLElement).style.setProperty('--app-bottom-reclaimed','24px'));
  await page.waitForTimeout(300);
  const after={card:(await card.boundingBox())!,show:(await show.boundingBox())!,report:(await report.boundingBox())!,known:(await known.boundingBox())!};
  expect(after.card.height-before.card.height).toBeGreaterThanOrEqual(24);
  expect(after.show.y-before.show.y).toBeGreaterThanOrEqual(24);
  expect(after.report.y-before.report.y).toBeGreaterThanOrEqual(24);
  expect(Math.max(after.report.y+after.report.height,after.known.y+after.known.height)).toBeLessThanOrEqual(874-20);
  await report.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await known.click();
  const choice = page.getByRole('region', {name:/Kies welke richtingen|Choose which directions/i});
  await expect(choice).toBeVisible();
  await choice.getByRole('button',{name:/^(Terug|Go back)$/i}).click();
  await expect(choice).toHaveCount(0);
  await show.click();
  await expect(stage).toHaveAttribute('data-side','answer');
  await expect(page.getByTestId('training-review-grid')).toBeVisible();
});
