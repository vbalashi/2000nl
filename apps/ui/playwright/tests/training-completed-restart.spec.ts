import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";
const devTestLogin = process.env.TRAINING_RELIABILITY_DEV_LOGIN === "true";

test("@pilot completed meaning session starts a new run directly from home", async ({ page }) => {
  const fixture = await setupAuthenticatedTrainingAttributionPage(page, 0, {
    sessionOutcomes: ["card", "empty", "empty", "empty"],
    visualProfile: "answer",
    devTestLogin,
  });
  const start = page.getByRole("button", { name: /^(Start training|Начать тренировку|Training starten)$/i });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
  const reveal = page.getByRole("button", { name: /Show answer|Показать ответ|Antwoord Tonen/i });
  if (await reveal.isVisible()) await reveal.click();
  await page.getByRole("button", { name: /^(Good|Хорошо|Goed)$/i }).click();
  await page.getByRole("button", { name: /Back to Training|Вернуться к тренировке|Terug naar Training|Terug naar training/i }).click();
  await expect(start).toBeEnabled();
  await expect(page.getByRole("button", { name: /Continue training|Продолжить тренировку|Training hervatten/i })).toHaveCount(0);
  await start.click();
  await expect.poll(() => fixture.requests.sessionStarts.length).toBe(2);
});

test("@pilot paused meaning session still continues the same run", async ({ page }) => {
  const lookupRequests: Array<{ hasTarget: boolean; target: unknown }> = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/platform/v2/lookup") && request.method() === "POST") {
      const body = request.postDataJSON();
      lookupRequests.push({
        hasTarget: Object.hasOwn(body, "translationTargetLanguageCode"),
        target: body.translationTargetLanguageCode,
      });
    }
  });
  const fixture = await setupAuthenticatedTrainingAttributionPage(page, 0, {
    visualProfile: "answer", devTestLogin,
    settingsOverrides: { translation_lang: "off" },
  });
  await page.getByRole("button", { name: /^(Start training|Начать тренировку|Training starten)$/i }).click();
  await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
  await page.getByRole("button", { name: /Close session|Закрыть сессию|Sessie sluiten/i }).click();
  const resume = page.getByRole("button", { name: /Continue training|Продолжить тренировку|Training hervatten/i });
  await expect(resume).toBeEnabled();
  await resume.click();
  await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
  expect(fixture.requests.sessionStarts).toHaveLength(1);
  expect(lookupRequests.length).toBeGreaterThan(0);
  expect(lookupRequests.every((request) => request.hasTarget && request.target === null)).toBe(true);
});


for (const action of ["restart", "edit"] as const) test(`@pilot finite completion keeps the palette and supports ${action}`, async ({page}) => {
  await page.setViewportSize({width:429,height:916});
  const fixture = await setupAuthenticatedTrainingAttributionPage(page, 0, { visualProfile: "answer", devTestLogin, sessionPlannedTotal: 3 });
  const draft = {family:"meaning",scenarioId:"understanding",modes:["word-to-definition"],cardFilter:"both",listValue:"curated:list-attribution",materialMode:"collection",newReviewRatio:2,dateWindow:"all",sourceValue:"all",sessionSize:5};
  await page.route("**/api/training/setups", route => route.fulfill({json:{revision:1,document:{schemaVersion:1,mainTrainingId:"five",trainings:[{id:"five",name:"Five cards",languageCode:"nl",draft}]}}}));
  await page.reload();
  await page.route(/\/api\/training\/study-time\?session=/,async route => {const id=new URL(route.request().url()).searchParams.get("session"); await route.fulfill({json:{sessionId:id,activeMilliseconds:260000,measurementCount:12}});});
  await page.getByRole("button", {name: /^(Start training|Начать тренировку|Training starten)$/i}).click();
  await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
  const headerBefore = await page.locator("[data-training-session-main]").boundingBox();
  const progress = page.getByTestId("training-session-progress-track");
  await expect(progress).toBeVisible();
  await progress.evaluate(node => node.setAttribute("data-continuity-marker", "same-session"));
  for (let index = 0; index < 3; index++) {
    await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
    const reveal = page.getByRole("button", {name: /Show answer|Показать ответ|Antwoord Tonen/i});
    if (await reveal.isVisible()) await reveal.click();
    await page.getByRole("button", {name: /^(Good|Хорошо|Goed)$/i}).click();
    await expect.poll(() => fixture.requests.progressActions.length).toBe(index + 1);
    await expect(progress).toHaveAttribute("data-continuity-marker", "same-session");
    if (index < 2) await expect(reveal).toBeVisible();
  }
  const completed = page.getByTestId("training-usable-candidates-exhausted");
  await expect(completed).toHaveAttribute("data-training-v2-state", "completed");
  await expect(completed.getByRole("button")).toHaveCount(3);
  await expect(page.getByTestId("app-header")).toBeHidden();
  expect((await page.locator("[data-training-session-main]").boundingBox())?.y).toBe(headerBefore?.y);
  await expect(completed).toContainText(/4 min 20 sec|4 мин 20 сек/);
  await page.screenshot({path:`test-results/completion-${action}.png`});
  const colors: string[] = [];
  for (const dark of [false, true]) {
    await page.evaluate(value => document.documentElement.classList.toggle("dark", value), dark);
    const reading = completed.getByTestId("training-completion");
    colors.push(await reading.evaluate(el => getComputedStyle(el).backgroundColor));
    expect(colors.at(-1)).not.toBe("rgba(0, 0, 0, 0)");
  }
  expect(colors[0]).not.toBe(colors[1]);
  if (action === "edit") {
    await page.getByRole("button", {name: /Modify training|Изменить тренировку|Training aanpassen/i}).click();
    await expect(page.getByRole("heading", {name: /Session builder|Настройка тренировки|Training samenstellen/i})).toBeVisible();
    await expect(page.getByRole("button", {name: /^(Start training|Начать тренировку|Training starten)$/i})).toBeVisible();
    expect(fixture.requests.sessionStarts).toHaveLength(1);
    return;
  }
  await page.getByRole("button", {name: /Another 5 cards|Ещё 5 карточек|Nog 5 kaarten/i}).click();
  await expect.poll(() => fixture.requests.sessionStarts.length).toBe(2);
  await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
  expect(fixture.requests.sessionStarts[1].p_session_size).toBe("5");
  const {p_session_size: firstSize,p_request_id:firstId,...firstRecipe}=fixture.requests.sessionStarts[0];
  const {p_session_size: nextSize,p_request_id:nextId,...nextRecipe}=fixture.requests.sessionStarts[1];
  expect(nextRecipe).toEqual(firstRecipe); expect(nextId).not.toBe(firstId);
});


test("@pilot returning focus preserves Start and one click starts one run", async ({page}) => {
  const fixture = await setupAuthenticatedTrainingAttributionPage(page, 0, {visualProfile: "answer", devTestLogin});
  const start = page.getByRole("button", {name: /^(Start training|Начать тренировку|Training starten)$/i});
  await expect(start).toBeEnabled();
  let refreshReads = 0;
  await page.route(/\/api\/(settings\/material|training\/setups)(\?|$)/, async route => {
    refreshReads += 1;
    await new Promise(resolve => setTimeout(resolve, 800)); await route.fallback();
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => refreshReads).toBeGreaterThanOrEqual(2);
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
  expect(fixture.requests.sessionStarts).toHaveLength(1);
});

for (const viewport of [
  {name:"mobile", width:390, height:844},
  {name:"desktop", width:1280, height:900},
  {name:"landscape", width:844, height:300},
]) test(`@pilot completion matches training controls and stays accessible: ${viewport.name}`, async ({page}, testInfo) => {
  await page.setViewportSize({width:viewport.width,height:viewport.height});
  await setupAuthenticatedTrainingAttributionPage(page, 0, {visualProfile:"answer", devTestLogin, sessionPlannedTotal:1});
  await page.getByRole("button", {name:/^(Start training|Начать тренировку|Training starten)$/i}).click();
  const card = page.getByTestId("training-sense-card-v2");
  await expect(card).toBeVisible();
  const reveal = page.getByRole("button", {name:/Show answer|Показать ответ|Antwoord Tonen/i});
  await expect(reveal).toBeVisible();
  const activeButton = await reveal.evaluate(el => {
    const style = getComputedStyle(el);
    return {fontFamily:style.fontFamily,fontSize:style.fontSize,fontWeight:style.fontWeight,lineHeight:style.lineHeight,borderRadius:style.borderRadius,minHeight:style.minHeight};
  });
  await page.screenshot({path:testInfo.outputPath(`active-${viewport.name}.png`)});
  await reveal.click();
  await page.getByRole("button", {name:/^(Good|Хорошо|Goed)$/i}).click();
  const completion = page.getByTestId("training-completion");
  await expect(completion).toBeVisible();
  const restart = completion.getByRole("button").first();
  const completionButton = await restart.evaluate(el => {
    const style = getComputedStyle(el);
    return {fontFamily:style.fontFamily,fontSize:style.fontSize,fontWeight:style.fontWeight,lineHeight:style.lineHeight,borderRadius:style.borderRadius,minHeight:style.minHeight};
  });
  expect(completionButton).toEqual(activeButton);
  await page.screenshot({path:testInfo.outputPath(`completion-${viewport.name}.png`)});
  for (const button of await completion.getByRole("button").all()) {
    await button.scrollIntoViewIfNeeded();
    const buttonBounds = await button.boundingBox();
    const panelBounds = await completion.boundingBox();
    expect(buttonBounds!.y).toBeGreaterThanOrEqual(panelBounds!.y - 1);
    expect(buttonBounds!.y + buttonBounds!.height).toBeLessThanOrEqual(panelBounds!.y + panelBounds!.height + 1);
  }
  if (viewport.name === "landscape") await page.screenshot({path:testInfo.outputPath("completion-landscape-scrolled.png")});
});


test("@pilot upward audio swipe keeps the card controls visually steady", async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await setupAuthenticatedTrainingAttributionPage(page, 0, {
    visualProfile:"answer",devTestLogin,
    settingsOverrides:{training_audio_swipe_enabled:true},
  });
  let release!:()=>void;
  const pending=new Promise<void>(resolve=>{release=resolve;});
  let playbackRequests=0;
  await page.route("**/api/platform/v2/audio",async route=>{
    if(route.request().postDataJSON().prepareOnly) {
      await route.fulfill({json:{status:"ready"}}); return;
    }
    playbackRequests++;
    await pending;
    await route.fulfill({contentType:"audio/mpeg",body:"ID3"});
  });
  await page.getByRole("button",{name:/^(Start training|Начать тренировку|Training starten)$/i}).click();
  const shell=page.getByTestId("training-sense-card-shell");
  await expect(shell).toBeVisible();
  const reveal=page.getByRole("button",{name:/Show answer|Показать ответ|Antwoord Tonen/i});
  await page.evaluate(()=>{
    HTMLMediaElement.prototype.play=function(){document.documentElement.dataset.audioPlayed="yes";return Promise.resolve();};
  });
  const before=await reveal.evaluate(node=>getComputedStyle(node).opacity);
  await shell.evaluate(node=>{
    const target=node.querySelector("h2") ?? node;
    const touch={identifier:1,target,clientX:120,clientY:240};
    target.dispatchEvent(new TouchEvent("touchstart",{bubbles:true,touches:[new Touch(touch)]}));
    const end=new Touch({...touch,clientY:180});
    target.dispatchEvent(new TouchEvent("touchmove",{bubbles:true,cancelable:true,touches:[end]}));
    target.dispatchEvent(new TouchEvent("touchend",{bubbles:true,touches:[],changedTouches:[end]}));
  });
  await expect.poll(()=>playbackRequests).toBe(1);
  await expect(reveal).toBeEnabled();
  expect(await reveal.evaluate(node=>getComputedStyle(node).opacity)).toBe(before);
  release();
  await expect(page.locator("html")).toHaveAttribute("data-audio-played","yes");
});
