import { expect,test } from "@playwright/test";
import { platformV2Message } from "../../lib/platform/platformV2ClientI18n";
import { getUiMessages } from "../../lib/uiMessages";
for (const language of ["en","nl","ru"] as const) for (const family of ["idiom","sentence"] as const) {
 test(`${language} ${family}: Extra state text scrolls independently of the return action`,async({page},testInfo)=>{
  const text=getUiMessages(language),t=text.trainingExercises[family];
  for (const [mode,height] of [["light",568],["dark",240]] as const) {
   await page.setViewportSize({width:320,height});
   for (const state of ["empty","complete","loading","error"]) {
    await page.goto(`/dev/sense-card-gate?prototype=session-states&language=${language}&family=${family}&state=${state}&mode=${mode}`);
    expect(await page.locator("body").evaluate(el=>el.scrollWidth<=window.innerWidth)).toBe(true);
    if(state==="error") {
     await expect(page.locator("main").getByRole("alert")).toContainText(t.failed);
     const retry=page.getByRole("button",{name:t.retry,exact:true});
     await expect(retry).toBeInViewport({ratio:1});
     const message=page.locator("main [role=alert] > span");
     await message.focus(); await page.keyboard.press("End");
     await expect.poll(()=>message.evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop)).toBeLessThanOrEqual(1);
     await expect(retry).toBeInViewport({ratio:1});
     if(language==="nl") await page.screenshot({path:testInfo.outputPath(`error-${mode}.png`)});
     await retry.click();
     await expect(page.locator("output")).toHaveText("retried");
    } else {
     const title=state==="loading"?t.loading:state==="empty"?t.empty:t.complete;
     const reading=page.getByRole("region",{name:title,exact:true}); await expect(reading).toBeVisible();
     expect(await reading.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
     if(state==="loading") { await expect(page.getByTestId("training-session-state").getByRole("button")).toHaveCount(0); continue; }
     const back=page.getByRole("button",{name:text.trainingSession.back,exact:true});
     await expect(back).toBeInViewport({ratio:1});
     await reading.focus(); await page.keyboard.press("End");
     await expect.poll(()=>reading.evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop)).toBeLessThanOrEqual(1);
     await expect(back).toBeInViewport({ratio:1});
     if(language==="ru"&&state==="empty") await page.screenshot({path:testInfo.outputPath(`state-${mode}.png`)});
     await back.click(); await expect(page.locator("output")).toHaveText("returned");
    }
   }
  }
 });
}

for (const language of ["en","nl","ru"] as const) {
 test(`${language}: unavailable ordinary states retain pinned owner actions at Extra`,async({page},testInfo)=>{
  await page.setViewportSize({width:320,height:240});
  for (const state of ["unsupported","exhausted","failure"] as const) {
   await page.goto(`/dev/sense-card-gate?prototype=session-states&language=${language}&state=${state}&mode=dark`);
   const back=page.getByRole("button",{name:getUiMessages(language).trainingSession.back,exact:true});
   await expect(back).toBeInViewport({ratio:1});
   expect(await page.locator("body").evaluate(node=>node.scrollWidth<=window.innerWidth)).toBe(true);
   const title=platformV2Message(language,`senseCard.training.${state==="unsupported"?"unsupportedMode":state==="exhausted"?"exhausted":"loadFailed"}`);
   const reading=page.getByRole("region",{name:title,exact:true});
   await reading.focus(); await page.keyboard.press("End");
   await expect.poll(()=>reading.evaluate(node=>node.scrollHeight-node.clientHeight-node.scrollTop)).toBeLessThanOrEqual(1);
   await expect(back).toBeInViewport({ratio:1});
   if(state==="failure") {
    const retry=page.getByRole("button",{name:platformV2Message(language,"senseCard.training.retry"),exact:true});
    await expect(retry).toBeInViewport({ratio:1}); await retry.click();
    await expect(page.locator("output")).toHaveText("retried");
   }
   if(language==="ru") await page.screenshot({path:testInfo.outputPath(`${state}-extra-short.png`)});
   await back.click(); await expect(page.locator("output")).toHaveText("returned");
  }
 });
}
