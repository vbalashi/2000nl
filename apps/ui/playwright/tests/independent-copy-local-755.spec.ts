import { expect, test } from "@playwright/test";
import { getUiMessages } from "../../lib/uiMessages";
import { independentEntryCopyText } from "../../lib/platform/independentEntryCopyText";
import type { OnboardingLanguage } from "../../lib/onboardingI18n";
test("@local-copy-755 real desktop and mobile independent copy", async ({
  page,
  request,
  baseURL,
}, testInfo) => {
  test.skip(
    process.env.INDEPENDENT_COPY_QA !== "1",
    "Requires reviewed local DB",
  );
  test.setTimeout(240_000);
  page.setDefaultTimeout(20_000);
  expect(new URL(baseURL!).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
  const health = await (await request.get("/api/health?deep=1")).json();
  expect(health.status).toBe("ok");
  expect(health.database.target).toBe("local");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/dev/test-login?redirectTo=/");
  await page.waitForURL((url) => url.pathname === "/", { timeout: 60_000 });
  const token = await page.evaluate(() => {
    for (const key of Object.keys(localStorage))
      if (/^sb-.*-auth-token$/.test(key)) {
        const value = JSON.parse(localStorage.getItem(key)!);
        if (value.access_token) return value.access_token as string;
      }
    throw new Error("Missing QA session");
  });
  const headers = { authorization: `Bearer ${token}` },
    created: string[] = [];
  const library = page
    .locator('[data-app-primary-navigation="desktop"]')
    .getByRole("button", { name: /Library|Bibliotheek|Библиотека/ });
  await library.click();
  const words = page
    .getByRole("navigation", { name: /^(Library|Библиотека|Bibliotheek)$/ })
    .getByRole("button", { name: /^(Words|Слова|Woorden)$/ });
  const title = (await words.textContent())?.trim();
  const language: OnboardingLanguage =
      title === "Слова" ? "ru" : title === "Woorden" ? "nl" : "en",
    ui = getUiMessages(language),
    copy = independentEntryCopyText(language);
  try {
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width: 1280, height: 900 });
      const word = `qa755-${width}-${Date.now()}`;
      const response = await request.post("/api/platform/v1/actions", {
        headers,
        data: {
          action: "create-user-entry",
          entry: {
            headword: word,
            languageCode: "nl",
            partOfSpeech: "noun",
            meanings: [
              { definition: "eerste uitleg", examples: ["een voorbeeld"] },
              { definition: "tweede uitleg" },
            ],
            notes: "Own instructional note",
          },
        },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      const original = (await response.json()).entryId;
      created.push(original);
      await page.reload();
      await library.click();
      await page
        .getByRole("textbox", { name: ui.library.search, exact: true })
        .fill(word);
      const row = page
        .locator('[data-testid="library-headword-group-row"]:visible')
        .filter({ hasText: word });
      await expect(row).toHaveCount(1);
      await row.click();
      if (width < 701) {
        await page.setViewportSize({ width, height: 900 });
        await page
          .getByRole("button", {
            name: new RegExp(
              `${ui.library.expandCard}|${ui.library.collapseCard}`,
            ),
          })
          .press("End");
      }
      const card = page.locator(`article[data-entry-id="${original}"]:visible`);
      await expect(card).toBeVisible();
      const more = card.getByRole("button", {
        name: ui.library.moreActions,
        exact: true,
      });
      await more.click();
      await page
        .getByRole("menuitem", { name: copy.action, exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(
        dialog.getByRole("button", { name: copy.confirm, exact: true }),
      ).toBeEnabled();
      await page.screenshot({
        path: testInfo.outputPath(`confirm-${width}.png`),
      });
      await dialog
        .getByRole("button", { name: copy.cancel, exact: true })
        .click();
      await more.click();
      await page
        .getByRole("menuitem", { name: copy.action, exact: true })
        .click();
      await expect(
        dialog.getByRole("button", { name: copy.confirm, exact: true }),
      ).toBeEnabled();
      const finished = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/api/library/entry-copies" &&
          r.request().method() === "POST",
      );
      await dialog
        .getByRole("button", { name: copy.confirm, exact: true })
        .click();
      const done = await finished;
      expect(done.ok(), await done.text()).toBeTruthy();
      const result = await done.json();
      created.push(result.entryId);
      expect(result.entryId).not.toBe(original);
      expect(result.headword).toBe(word);
      await expect(dialog.getByRole("heading")).toHaveText(copy.success);
      await page.screenshot({
        path: testInfo.outputPath(`success-${width}.png`),
      });
      await dialog
        .getByRole("button", { name: copy.open, exact: true })
        .click();
      await expect(
        page.locator(`article[data-entry-id="${result.entryId}"]:visible`),
      ).toBeVisible();
      expect(
        (
          await request.post("/api/platform/v1/actions", {
            headers,
            data: { action: "delete-user-entry", entryId: original },
          })
        ).ok(),
      ).toBeTruthy();
      const lookup = await request.post("/api/platform/v2/lookup", {
        headers,
        data: {
          entryId: result.entryId,
          contentLanguageCode: "nl",
          translationTargetLanguageCode: null,
          cardTypeId: "word-to-definition",
          intent: "dictionary-lookup",
        },
      });
      expect(lookup.ok(), await lookup.text()).toBeTruthy();
      expect(JSON.stringify(await lookup.json())).toContain(result.entryId);
      const sourceLabel=page.locator('[data-testid="sense-card-headword-lockup"]:visible > [title]');
      if(width>=701) await expect(sourceLabel).toBeHidden(); else await expect(sourceLabel).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);
      await page.screenshot({
        path: testInfo.outputPath(`opened-${width}.png`),
      });
    }
  } finally {
    for (const entryId of created)
      await request.post("/api/platform/v1/actions", {
        headers,
        data: { action: "delete-user-entry", entryId },
      });
  }
});
