import {expect,test} from "@playwright/test";
import {setupAuthenticatedTrainingAttributionPage} from "../support/trainingAttributionHarness";

test.use({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
test.skip(process.env.NEXT_PUBLIC_TRAINING_PRESENTATION_V1 !== "true", "Approved presentation is opt-in.");
for (const profile of ["compact","long-idiom"] as const) {
 test(`${profile}: mobile chrome and footer stay fixed while the answer scrolls`,async({page})=>{
  await setupAuthenticatedTrainingAttributionPage(page,0,{
   devTestLogin:true,
   visualProfile:profile === "compact" ? "face" : profile,
   settingsOverrides:{reading_size_phone:"extra"},
  });
  await page.getByRole("button",{name:/Start training|Training starten|Начать тренировку/i}).click();
  await page.getByRole("button",{name:/Show answer|Antwoord tonen|Показать ответ/i}).click();
  const header=page.getByTestId("training-session-chrome");
  const ratings=page.getByTestId("training-review-grid");
  await expect(header).toBeInViewport({ratio:1});await expect(ratings).toBeInViewport({ratio:1});
  // PWA/browser viewport changes must not leave a larger 100vh body behind.
  for(const height of [740,852]){
   await page.setViewportSize({width:393,height});
   await expect.poll(()=>page.locator("body").evaluate(el=>getComputedStyle(el).minHeight)).toBe("0px");
   const before=await header.boundingBox();
   await page.evaluate(()=>window.scrollTo(0,1000));
   await page.mouse.move(200,700);await page.mouse.wheel(0,900);
   expect(await page.evaluate(()=>window.scrollY)).toBe(0);
   expect((await header.boundingBox())!.y).toBe(before!.y);
   await expect(ratings).toBeInViewport({ratio:1});
  }
  const scroll=page.getByTestId("training-answer-scroll");
  if(profile === "long-idiom"){
   await page.setViewportSize({width:393,height:400});
   await expect.poll(()=>scroll.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeGreaterThan(0);
   await scroll.evaluate(el=>{el.scrollTop=el.scrollHeight;});
   expect(await scroll.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  }
  await expect(header).toBeInViewport({ratio:1});await expect(ratings).toBeInViewport({ratio:1});
  expect(await page.locator("html").evaluate(el=>getComputedStyle(el).overscrollBehavior)).toBe("none");
 });
}
