import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";
import { getUiMessages } from "../../lib/uiMessages";
import { platformV2Message } from "../../lib/platform/platformV2ClientI18n";

test.skip(process.env.NEXT_PUBLIC_TRAINING_PRESENTATION_V1 !== "true", "Approved presentation is opt-in.");
for (const language of ["en", "nl", "ru"] as const) {
  test(`${language}: exclusion choices stay bounded and dismiss without mutation`, async ({page}, testInfo) => {
    await page.setViewportSize({width:320, height:568});
    await page.emulateMedia({reducedMotion:"reduce"});
    await setupAuthenticatedTrainingAttributionPage(page, 0, {visualProfile:"answer", useUuidEntryIds:true,
      useUuidSessionId:true, devTestLogin:true, settingsOverrides:{reading_size_phone:"extra", reading_size_desktop:"extra",
        preferences:{onboardingCompleted:true, onboardingLanguage:language}}});
    await page.getByRole("button", {name:/Training starten|Start training|Начать тренировку/i}).click();
    const stage = page.getByTestId("training-sense-card-stage");
    await expect(stage).toBeVisible();
    let writes = 0;
    page.on("request", request => { if (request.method() === "POST" && /\/api\/platform\/v2\/(?:actions|training\/exclusions)/.test(request.url())) writes++; });
    const opener = stage.getByRole("button", {name:getUiMessages(language).trainingSession.exclusion.help});
    for (const side of ["face", "answer"] as const) {
      if (side === "answer") await stage.getByRole("button", {name:platformV2Message(language,"senseCard.answer.show"), exact:true}).click();
      await opener.scrollIntoViewIfNeeded();
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect(opener).toHaveAttribute("aria-haspopup", "menu");
      if (side === "face") {
        await opener.focus();
        await page.keyboard.press("Enter");
      } else await opener.click();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      await expect(menu.getByRole("menuitem")).toHaveCount(2);
      await expect(menu).toBeInViewport({ratio:1});
      expect(await menu.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      await page.screenshot({path:testInfo.outputPath(`exclude-${side}.png`)});
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(opener).toBeFocused();
      await expect(stage).toHaveAttribute("data-side",side);
    }
    expect(writes).toBe(0);
  });
}
