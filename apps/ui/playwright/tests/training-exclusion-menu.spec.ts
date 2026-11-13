import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";
import { getUiMessages } from "../../lib/uiMessages";
import { platformV2Message } from "../../lib/platform/platformV2ClientI18n";

test("Known choice transfers reading focus on resize without stealing button focus", async ({page}) => {
  await page.setViewportSize({width:320,height:568});
  await page.emulateMedia({reducedMotion:"reduce"});
  await setupAuthenticatedTrainingAttributionPage(page,0,{visualProfile:"answer",useUuidEntryIds:true,useUuidSessionId:true,settingsOverrides:{preferences:{onboardingCompleted:true,onboardingLanguage:"en"}}});
  const copy=getUiMessages("en").trainingSession.knownChoice;
  await page.getByRole("button",{name:/^Start training$/i}).click();
  const stage=page.getByTestId("training-sense-card-stage");
  await stage.getByRole("button",{name:platformV2Message("en","senseCard.answer.show"),exact:true}).click();
  await stage.getByRole("button",{name:copy.markKnown,exact:true}).click();
  const choice=page.getByRole("region",{name:copy.choiceLabel,exact:true});
  const next=choice.getByRole("button",{name:copy.next,exact:true});
  await expect(next).toBeEnabled();
  const reading=choice.getByTestId("training-answer-scroll");
  await expect(reading).toHaveAttribute("data-reading-layout","compact");
  await reading.focus();
  await expect(reading).toBeFocused();
  await page.setViewportSize({width:320,height:844});
  await expect(reading).toHaveAttribute("data-reading-layout","regular");
  await expect(reading).toBeFocused();
  await page.setViewportSize({width:320,height:568});
  await expect(reading).toHaveAttribute("data-reading-layout","compact");
  await expect(reading).toBeFocused();
  await next.focus();
  await page.setViewportSize({width:320,height:844});
  await expect(reading).toHaveAttribute("data-reading-layout","regular");
  await expect(next).toBeFocused();
  await page.setViewportSize({width:320,height:568});
  await expect(reading).toHaveAttribute("data-reading-layout","compact");
  await expect(next).toBeFocused();
});
for (const language of ["en", "nl", "ru"] as const) {
  test(`${language}: Known choices stay bounded and Back cancels on either card side`, async ({page}, testInfo) => {
    await page.setViewportSize({width:320, height:568});
    await page.emulateMedia({reducedMotion:"reduce"});
    const fixture = await setupAuthenticatedTrainingAttributionPage(page, 0, {visualProfile:"answer", useUuidEntryIds:true,
      useUuidSessionId:true, settingsOverrides:{reading_size_phone:"extra", reading_size_desktop:"extra",
        preferences:{onboardingCompleted:true, onboardingLanguage:language}}});
    const copy = getUiMessages(language).trainingSession.knownChoice;
    await page.getByRole("button", {name:/Training starten|Start training|Начать тренировку/i}).click();
    const stage = page.getByTestId("training-sense-card-stage");
    await expect(stage).toBeVisible();
    const opener = stage.getByRole("button", {name:copy.markKnown, exact:true});
    for (const side of ["face", "answer"] as const) {
      if (side === "answer") await stage.getByRole("button", {name:platformV2Message(language,"senseCard.answer.show"), exact:true}).click();
      await expect(stage).toHaveAttribute("data-side",side);
      await expect(stage).not.toHaveAttribute("data-reveal-moving","true");
      await page.evaluate(async()=>{await document.fonts.ready;await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));});
      const shellBefore = await page.getByTestId("training-sense-card-shell").boundingBox();
      const dockBefore = await page.getByTestId("training-sense-card-dock").boundingBox();
      await opener.click();
      const choice = page.getByRole("region", {name:copy.choiceLabel, exact:true});
      await expect(choice.getByRole("button",{name:copy.next,exact:true})).toBeEnabled();
      await expect(choice.getByRole("group")).toHaveCount(2);
      expect(await choice.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      expect(await page.getByTestId("training-sense-card-shell").boundingBox()).toEqual(shellBefore);
      expect(await page.getByTestId("training-sense-card-dock").boundingBox()).toEqual(dockBefore);
      // Editing either direction remains local until Next.
      await choice.getByRole("button",{name:copy.markKnown,exact:true}).click();
      await expect(choice.getByText(copy.known,{exact:true})).toHaveCount(2);
      expect(fixture.requests.knownChoices).toHaveLength(0);
      await page.screenshot({path:testInfo.outputPath(`known-${side}.png`)});
      await choice.getByRole("button",{name:copy.back,exact:true}).click();
      await expect(choice).toHaveCount(0);
      await expect(stage).toHaveAttribute("data-side",side);
      await expect(opener).toBeFocused();
    }
    expect(fixture.requests.knownChoices).toHaveLength(0);
    expect(fixture.requests.progressActions).toHaveLength(0);
  });
}

for (const both of [false,true]) {
  test(`Next saves ${both ? "both directions" : "current direction"} once and advances`,async({page})=>{
    const fixture=await setupAuthenticatedTrainingAttributionPage(page,0,{visualProfile:"answer",useUuidEntryIds:true,useUuidSessionId:true,settingsOverrides:{preferences:{onboardingCompleted:true,onboardingLanguage:"en"}}});
    const copy=getUiMessages("en").trainingSession.knownChoice;
    await page.getByRole("button",{name:/^Start training$/i}).click();
    const stage=page.getByTestId("training-sense-card-stage");
    await expect(stage).toBeVisible();
    const first=fixture.requests.currentCards.acknowledgements.at(-1)!;
    await stage.getByRole("button",{name:copy.markKnown,exact:true}).click();
    const choice=page.getByRole("region",{name:copy.choiceLabel,exact:true});
    await expect(choice.getByRole("button",{name:copy.next,exact:true})).toBeEnabled();
    if(both)await choice.getByRole("button",{name:copy.markKnown,exact:true}).click();
    expect(fixture.requests.knownChoices).toHaveLength(0);
    await choice.getByRole("button",{name:copy.next,exact:true}).click();
    await expect(choice).toHaveCount(0);
    await expect(stage).toBeVisible();
    expect(fixture.requests.knownChoices).toHaveLength(1);
    expect(fixture.requests.knownChoices[0]).toMatchObject({entryId:first.entryId,trainingSessionId:first.sessionId,currentDirection:first.cardTypeId,
      knownDirections:both?["word-to-definition","definition-to-word"]:[first.cardTypeId],revision:"a".repeat(64)});
    expect(fixture.requests.knownChoices[0].clientEventId).toMatch(/^[a-f0-9-]{36}$/);
    expect(fixture.requests.currentCards.acknowledgements.at(-1)!.entryId).not.toBe(first.entryId);
    expect(fixture.requests.progressActions).toHaveLength(0);
  });
}
