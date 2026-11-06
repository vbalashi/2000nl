import {expect,test} from '@playwright/test';
import {mkdirSync,writeFileSync,renameSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {canonicalJson,snapshotPayload} from '../../lib/i18n/snapshot-contract.mjs';
import type {InterfaceSnapshot} from '../../lib/i18n/runtime';
import {setupAuthenticatedTrainingAttributionPage} from '../support/trainingAttributionHarness';

test.skip(process.env.PLAYWRIGHT_RUNTIME_CATALOGS!=='true','Dedicated server with a writable test catalog directory is required.');
test('@runtime-catalog publishes text and a new language on one running build, preserves the run and supports rollback/cache',async({page,request})=>{
 test.setTimeout(90_000);
 const directory=process.env.INTERFACE_CATALOG_TEST_DIR??path.join(process.cwd(),'test-results/runtime-catalog-server');mkdirSync(directory,{recursive:true});
 const initial=await (await request.get('/api/interface-catalog')).json() as InterfaceSnapshot;
 const next=structuredClone(initial);next.registry.fr={name:'Français distant',direction:'ltr',formatLocale:'fr-FR'};
 next.catalogs.fr=structuredClone(next.catalogs.en); // Synthetic test locale, not a production translation.
 next.catalogs.en.ui.navigation.library='Live word library';next.catalogs.fr.ui.navigation.library='Bibliothèque distante';
 next.catalogs.en.features.appMetadata.title='Runtime catalog title';next.catalogs.en.features.appMetadata.description='Runtime catalog description';
 next.catalogs.fr.tour.interfaceTitle='Choisir la langue distante';
 next.revision=createHash('sha256').update(canonicalJson(snapshotPayload(next))).digest('hex');
 const publish=(value:unknown)=>{const temporary=path.join(directory,'pending.tmp');writeFileSync(temporary,JSON.stringify(value));renameSync(temporary,path.join(directory,`${initial.contract}.json`));};
 const revision=async()=> (await (await request.get('/api/interface-catalog')).json()).revision;
 const preferences={onboardingLanguage:'en'};
 await setupAuthenticatedTrainingAttributionPage(page,0,{devTestLogin:false,visualProfile:'answer',settingsOverrides:{preferences}});
 await page.locator('[data-onboarding="launch"]').click();
 const card=page.getByTestId('training-sense-card-v2');await expect(card).toBeVisible();
 await card.evaluate(el=>el.setAttribute('data-original-card','true'));
 try {
  publish(next);await expect.poll(revision,{timeout:15_000}).toBe(next.revision);
  await expect(card).toHaveAttribute('data-original-card','true'); // Publishing did not reload/remount a session.
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await page.reload();await expect(page.getByRole('button',{name:'Live word library',exact:true})).toBeVisible();
  await expect(page).toHaveTitle('Runtime catalog title');
  const manifest=await (await request.get('/api/interface-manifest')).json();expect(manifest.name).toBe('Runtime catalog title');expect(manifest.description).toBe('Runtime catalog description');
  await page.locator('[data-tour="settings-button"]').click();
  await page.getByRole('navigation',{name:next.catalogs.en.ui.settings.sections,exact:true}).getByRole('button',{name:next.catalogs.en.ui.settings.languages,exact:true}).click();
  await page.locator('[data-onboarding="interface"]').click();await page.getByRole('menuitem',{name:'Français distant'}).click();
  await expect(page.locator('html')).toHaveAttribute('lang','fr');
  await expect(page.getByRole('button',{name:'Bibliothèque distante',exact:true})).toBeVisible();
  preferences.onboardingLanguage='fr';
  publish({formatVersion:1,catalogs:{fr:{}}});
  await page.waitForTimeout(5200);expect(await revision()).toBe(next.revision); // Last good server snapshot.
  await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','fr');
  // A tab with unavailable catalog delivery recovers the verified browser cache.
  await page.route('**/api/interface-catalog?*',route=>route.abort());
  const rootDocument=(url:URL)=>url.pathname==='/';
  await page.route(rootDocument,async route=>{
   const response=await route.fetch();const html=(await response.text()).replace(/window\.__2000NL_INTERFACE_CATALOG__=[\s\S]*?;<\/script>/,'void 0;</script>');
   await route.fulfill({response,body:html});
  });
  await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','fr');await expect(page.getByRole('button',{name:'Bibliothèque distante',exact:true})).toBeVisible();
  await page.unroute('**/api/interface-catalog?*');await page.unroute(rootDocument);
  publish(initial);await expect.poll(revision,{timeout:15_000}).toBe(initial.revision);
  preferences.onboardingLanguage='en';await page.reload();await expect(page.getByRole('button',{name:initial.catalogs.en.ui.navigation.library,exact:true})).toBeVisible();
  expect((await request.get('/api/interface-catalog?contract=incompatible')).status()).toBe(409);
 } finally {publish(initial);}
});
