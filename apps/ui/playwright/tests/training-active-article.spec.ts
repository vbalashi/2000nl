import {expect,test} from '@playwright/test';
import {setupAuthenticatedTrainingAttributionPage} from '../support/trainingAttributionHarness';
import {financeEntry} from '../../tests/platformV2LibraryFixture';
import {getUiMessages} from '../../lib/uiMessages';
import {platformV2Message} from '../../lib/platform/platformV2ClientI18n';

for(const [language,width] of [['ru',320],['nl',390],['en',1024]] as const)test(`${language}: active article notice protects the exercise and preserves sibling actions`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:844});
 await page.emulateMedia({reducedMotion:'reduce'});
 await setupAuthenticatedTrainingAttributionPage(page,0,{
  visualProfile:'answer',useUuidEntryIds:true,useUuidSessionId:true,
  settingsOverrides:{reading_size_phone:'extra',reading_size_desktop:'extra',preferences:{onboardingCompleted:true,onboardingLanguage:language}},
  transformLookupGroup:group=>{
   const entry=group.entries.find(entry=>entry.kind==='sense-card');
   if(entry?.kind!=='sense-card')return group;
   return {...group,senseCount:2,entryCount:2,entries:[entry,{...financeEntry,meaningOrdinal:2}]};
  },
 });
 await page.getByRole('button',{name:/^(Start training|Training starten|Начать тренировку)$/i}).click();
 const stage=page.getByTestId('training-sense-card-stage');
 await stage.getByRole('button',{name:/Show answer|Antwoord tonen|Показать ответ/i}).click();
 const opener=stage.getByRole('button',{name:/Word details|Woorddetails|Сведения о слове/i});
 await opener.click();
 const panel=page.getByRole('dialog',{name:/Word details|Woorddetails|Сведения о слове/i});
 const active=panel.locator('article:has([data-testid="active-training-card-notice"])');
 const notice=active.getByTestId('active-training-card-notice');
 const copy=getUiMessages(language);
 await expect(notice).toContainText(copy.activeTrainingCard.title);
 await expect(notice).toContainText(copy.activeTrainingCard.hint);
 expect(await notice.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
 await expect(active.getByRole('button',{name:platformV2Message(language,'senseCard.learning.start'),exact:true})).toHaveCount(0);
 let writes=0;
 page.on('request',request=>{if(request.method()==='POST'&&/\/api\/(platform\/v2\/(actions|training\/exclusions)|training\/meaning-progress)/.test(request.url()))writes++;});
 const openMore=async(card:typeof active)=>{
  const trigger=card.getByRole('button',{name:copy.library.moreActions});
  await trigger.scrollIntoViewIfNeeded();
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await trigger.click();
 };
 await openMore(active);
 const menu=page.getByRole('menu');
 const exclude=menu.getByRole('menuitem',{name:copy.trainingSession.exclusion.headwordLabel});
 await expect(exclude).toBeDisabled();
 await expect(exclude).toHaveAccessibleDescription(copy.activeTrainingCard.actionHint);
 await expect(menu.getByRole('menuitem',{name:platformV2Message(language,'senseCard.known.mark')})).toBeDisabled();
 await expect(menu.getByRole('menuitem',{name:platformV2Message(language,'senseCard.report')})).toBeEnabled();
 await page.keyboard.press('Escape');
 const sibling=panel.getByTestId(`library-sense-card-${financeEntry.entryId}`);
 await sibling.getByRole('button',{name:/Expand meaning|Betekenis uitklappen|Развернуть значение/i}).click();
 await expect(sibling.getByRole('button',{name:platformV2Message(language,'senseCard.learning.start'),exact:true})).toBeEnabled();
 await expect(active.getByTestId('active-training-card-notice')).toBeVisible();
 await openMore(sibling);
 await expect(menu.getByRole('menuitem',{name:copy.trainingSession.exclusion.headwordLabel})).toBeDisabled();
 await expect(menu.getByRole('menuitem',{name:platformV2Message(language,'senseCard.known.mark')})).toBeEnabled();
 await page.keyboard.press('Escape');
 await notice.scrollIntoViewIfNeeded();
 await page.screenshot({path:testInfo.outputPath(`active-article-${language}.png`)});
 await panel.getByRole('button',{name:/Close|Sluiten|Закрыть/,exact:true}).click();
 await expect(panel).toHaveCount(0);await expect(opener).toBeFocused();
 await expect(stage).toHaveAttribute('data-side','answer');
 expect(writes).toBe(0);
});
