import { expect, test, type Locator } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";
import { multiSenseBankGroup } from "../../tests/platformV2LibraryFixture";
import { getUiMessages } from "../../lib/uiMessages";
import { platformV2Message } from "../../lib/platform/platformV2ClientI18n";
test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});
async function drag(
  page: import("@playwright/test").Page,
  target: Locator,
  delta: number,
) {
  const box = (await target.boundingBox())!;
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - delta, { steps: 8 });
}
test("@pilot shared stationary headers drag, body scrolls, pointer focus has no frame and keyboard focus remains", async ({
  page,
}) => {
  await setupAuthenticatedTrainingAttributionPage(page, 0, {
    visualProfile: "answer",
  });
  const group = structuredClone(multiSenseBankGroup);
  const entry = group.entries.find((e) => e.kind === "sense-card")!;
  if (entry.kind !== "sense-card") throw Error("fixture");
  const progress = {
    entryId: entry.entryId,
    headword: "bank",
    exclusionId: null,
    revision: "a".repeat(64),
    directions: ["word-to-definition", "definition-to-word"].map(
      (cardTypeId) => ({
        cardTypeId,
        stateRevision: "untracked",
        knownMarkId: null,
        knownMarkRevision: null,
        knownMarkedAt: null,
        phase: "reviewing",
        presentations: 19,
        gradedAttempts: 19,
        lastGrade: 3,
        lastReviewedAt: "2026-10-01T12:00:00Z",
        nextReviewAt: "2026-10-10T12:00:00Z",
        stability: 12.4,
        difficulty: 4.1,
      }),
    ),
  };
  entry.card!.meaningProgress = progress as NonNullable<
    typeof entry.card
  >["meaningProgress"];
  const respond = async (route: import("@playwright/test").Route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      json: {
        contractVersion: "platform-lookup-v2",
        query: body.query ?? "bank",
        request: {
          contentLanguageCode: body.contentLanguageCode,
          translationTargetLanguageCode: body.translationTargetLanguageCode,
          cardTypeId: body.cardTypeId,
          intent: body.intent,
        },
        groups: [group],
        page: { selectedTierComplete: true, nextGroupCursor: null },
        librarySearch: {
          totalGroups: 1,
          matchingEntryIds: group.entries.flatMap((e) =>
            "entryId" in e ? [e.entryId] : [],
          ),
        },
      },
    });
  };
  await page.route("**/api/library/search", respond);
  await page.route("**/api/platform/v2/lookup", respond);
  await page.route("**/api/training/meaning-progress?*", (route) =>
    route.fulfill({ json: progress }),
  );
  await page
    .locator('[data-app-mobile-navigation="tabs"]')
    .getByRole("button")
    .nth(1)
    .click();
  await page
    .locator('[data-testid^="library-headword-group-"]')
    .first()
    .click();
  const sheet = page.locator("section[data-dragging]");
  const header = sheet
    .getByTestId("library-sense-card-group")
    .locator("header")
    .first();
  await expect(sheet.getByTestId("library-sense-card-group")).toBeVisible();
  const height = () =>
    sheet.evaluate((el) => el.getBoundingClientRect().height);
  const before = await height();
  await drag(
    page,
    header.getByRole("heading", { name: "bank", exact: true }),
    80,
  );
  await expect.poll(height).toBeGreaterThan(before + 60);
  await page.mouse.up();
  const scroll = sheet.getByTestId("library-sense-card-scroll-region");
  await scroll.focus();
  await expect(scroll).toHaveCSS("box-shadow", "none");
  await page.keyboard.press("Tab");
  const handle = sheet.getByRole("button", {
    name: /Expand word card|Collapse word card|Woordkaart/i,
  });
  await handle.focus();
  await expect(handle).toHaveCSS("outline-style", "solid");
  // Expand enough to expose the meaning's existing status chip.
  await handle.press("End");
  await sheet
    .getByRole("button", { name: /Reviewing|Herhalen/, exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const resize = dialog.getByRole("button", {
    name: /Resize|Hoogte|Размер|Изменить/i,
  });
  await expect(resize).toHaveCSS("outline-style", "none");
  const title = dialog.getByRole("heading", {
    name: /Learning progress|Leervoortgang/,
  });
  const dialogHeight = () =>
    dialog.evaluate((el) => el.getBoundingClientRect().height);
  const initial = await dialogHeight();
  await drag(page, title, 100);
  await expect.poll(dialogHeight).toBeGreaterThan(initial + 80);
  await page.mouse.up();
  await resize.press("Home");
  await resize.click();
  await expect.poll(dialogHeight).toBeCloseTo(initial, 0);
  const headingWord = dialog.locator("header p");
  expect(
    await headingWord.evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    ),
  ).toBeGreaterThanOrEqual(16);
  expect(
    await dialog.evaluate((el) => getComputedStyle(el).fontFamily),
  ).toContain("Inter");
  const body = dialog.locator('[class*="body"]').first();
  await body.evaluate((el) => (el.scrollTop = 200));
  expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await dialog
    .getByRole("button", { name: /close|sluiten/i, exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
});
for (const language of ["en", "nl", "ru"] as const)
  test(`@pilot ${language} menu explains direction and meaning; footer has touch space`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await setupAuthenticatedTrainingAttributionPage(page, 0, {
      visualProfile: "answer",
      useUuidEntryIds: true,
      useUuidSessionId: true,
      settingsOverrides: {
        reading_size_phone: "extra",
        preferences: {
          onboardingCompleted: true,
          onboardingLanguage: language,
        },
      },
    });
    await page
      .getByRole("button", {
        name: /Training starten|Start training|Начать тренировку/i,
      })
      .click();
    const stage = page.getByTestId("training-sense-card-stage");
    await expect(stage).toBeVisible();
    const t = getUiMessages(language);
    const opener = stage.getByRole("button", {
      name: t.trainingSession.exclusion.headwordHelp,
    });
    const report = stage.getByRole("button", {
      name: platformV2Message(language, "senseCard.report"),
      exact: true,
    });
    expect((await opener.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await report.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(
      (await opener.boundingBox())!.y + (await opener.boundingBox())!.height,
    ).toBeLessThanOrEqual(552);
    await opener.click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeInViewport({ ratio: 1 });
    await expect(
      menu.getByText(t.trainingSession.exclusion.headwordHelp),
    ).toBeVisible();
    await expect(menu.getByText(t.cardActions.knownHelp)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(opener).toHaveCSS("outline-style", "solid");
    expect(
      await page.locator("meta[name=viewport]").getAttribute("content"),
    ).toContain("viewport-fit=cover");
  });
