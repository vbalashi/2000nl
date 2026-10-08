import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";
import { multiSenseBankGroup } from "../../tests/platformV2LibraryFixture";
for (let sample = 0; sample < 10; sample += 1) {
  test(`isolated initial Library read ${sample + 1} recovers and retains 50 rows`, async ({page}, testInfo) => {
    let reads = 0;
    await page.route("**/api/library/search", async route => {
      reads += 1;
      if (reads === 1) {
        await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"temporarily_unavailable"})});
        return;
      }
      const body = route.request().postDataJSON();
      const offset = body.cursor ? 25 : 0;
      const groups = Array.from({length:25}, (_, index) => ({
        ...multiSenseBankGroup,
        headwordGroupId:`fixture-group-${offset + index}`,
        header:{text:`fixture ${offset + index}`},
        entries:multiSenseBankGroup.entries.map((entry, ordinal) => ({...entry,translation:null,wordDetails:undefined,entryId:`fixture-entry-${offset + index}-${ordinal}`})),
      }));
      await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({
        contractVersion:"platform-lookup-v2",query:body.query,
        request:{contentLanguageCode:body.contentLanguageCode,translationTargetLanguageCode:body.translationTargetLanguageCode,cardTypeId:body.cardTypeId,intent:body.intent},
        groups,page:{selectedTierComplete:!!offset,nextGroupCursor:offset ? null : "fixture-page-two"},
        librarySearch:{totalGroups:50,matchingEntryIds:groups.flatMap(group=>group.entries.map(entry=>entry.entryId))},
      })});
    });
    await page.setViewportSize({width:390,height:844});
    await setupAuthenticatedTrainingAttributionPage(page, 0, {visualProfile:"answer"});
    await page.waitForTimeout(900);
    expect(reads).toBe(0);
    const tabs=page.locator('[data-app-mobile-navigation="tabs"]');
    await tabs.getByRole("button").nth(1).click();
    await expect.poll(()=>reads).toBe(3);
    await expect(page.getByTestId("library-headword-group-fixture-group-0")).toBeVisible();
    await expect(page.locator('[data-testid^="library-headword-group-fixture-group-"]')).toHaveCount(50);
    await expect(page.getByTestId("library-workspace").getByRole("alert")).toHaveCount(0);
    expect(reads).toBe(3);
    if (sample === 0) {
      const timings:number[]=[];
      for(let visit=0;visit<20;visit+=1) {
        await tabs.getByRole("button").nth(0).click();
        const started=Date.now();
        await tabs.getByRole("button").nth(1).click();
    await expect.poll(()=>reads).toBe(3);
        await expect(page.getByTestId("library-headword-group-fixture-group-0")).toBeVisible();
        timings.push(Date.now()-started);
        expect(reads).toBe(3);
      }
      await testInfo.attach("warm-visits.json",{body:JSON.stringify({kind:"mocked transport, real UI",visits:20,reads,timings}),contentType:"application/json"});
    }
  });
}
