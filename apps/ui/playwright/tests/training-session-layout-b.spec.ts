import { expect, test, type Page } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";

async function startFixture(
  page: Page,
  profile: "answer" | "long-idiom" | "recoverable-error" = "answer",
) {
  // Fail closed outside deterministic transport handlers; never use a real account/DB.
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.protocol === "http:" &&
      url.hostname === "127.0.0.1" &&
      !url.pathname.startsWith("/api/")
      ? route.continue()
      : route.abort();
  });
  await setupAuthenticatedTrainingAttributionPage(page, 0, {
    visualProfile: profile,
  });
  await page
    .getByRole("button", {
      name: /^(?:Start training|Training starten|Начать тренировку)$/,
    })
    .click();
}

const viewports = [
  { name: "phone", width: 390, height: 844, inset: 10, cardWidth: 358 },
  { name: "tablet", width: 834, height: 1112, inset: 40, cardWidth: 760 },
  { name: "desktop", width: 1440, height: 960, inset: 40, cardWidth: 760 },
  { name: "short", width: 1024, height: 600, inset: 10, cardWidth: 760 },
  { name: "narrow", width: 320, height: 568, inset: 10, cardWidth: 288 },
];

test("long reading content scrolls while the word and actions stay pinned", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await startFixture(page, "long-idiom");
  const stage = page.getByTestId("training-sense-card-stage");
  await stage.getByRole("button", { name: "Antwoord tonen" }).click();
  await stage.getByRole("button", { name: "Vertalen", exact: true }).click();
  const word = stage.getByTestId("sense-card-headword-lockup");
  const dock = stage.getByTestId("training-sense-card-dock");
  const before = [await word.boundingBox(), await dock.boundingBox()];
  await stage.getByRole("button", { name: "Meer kaartinhoud tonen" }).click();
  const scroll = stage.getByTestId("training-answer-scroll");
  await expect
    .poll(() => scroll.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(10);
  expect([await word.boundingBox(), await dock.boundingBox()]).toEqual(before);
  await expect(scroll).toHaveAttribute("data-scroll-top", "faded");
  await page.screenshot({
    path: testInfo.outputPath("narrow-dark-scrolled-translation.png"),
  });
});

test("History and Settings return to the revealed card, while theme stays app-owned", async ({
  page,
}) => {
  await page.setViewportSize({ width: 834, height: 1112 });
  await startFixture(page);
  const stage = page.getByTestId("training-sense-card-stage");
  await stage.getByRole("button", { name: "Antwoord tonen" }).click();
  const history = page
    .getByTestId("training-session-chrome")
    .getByRole("button", { name: "Geschiedenis" });
  await history.focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: /Geschiedenis sluiten|Close history|Закрыть историю/i })
    .click();
  await expect(stage).toHaveAttribute("data-side", "answer");
  await expect(history).toBeFocused();
  await page
    .getByTestId("app-header")
    .getByRole("button", { name: "Instellingen" })
    .click();
  await page.getByRole("button", { name: "Training", exact: true }).click();
  await expect(stage).toHaveAttribute("data-side", "answer");
  const theme = page
    .getByTestId("app-header")
    .getByRole("button", { name: /Thema:/ });
  const oldLabel = await theme.getAttribute("aria-label");
  await theme.click();
  await expect(theme).not.toHaveAttribute("aria-label", oldLabel!);
  await expect(stage).toHaveAttribute("data-side", "answer");
});

test("failure remains recoverable without exposing rating controls", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "light" });
  await startFixture(page, "recoverable-error");
  const failure = page.getByTestId("training-v2-failure");
  await expect(failure).toBeVisible();
  await expect(page.getByTestId("training-session-chrome")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sessie sluiten" }),
  ).toBeVisible();
  await expect(page.getByTestId("training-sense-card-dock")).toBeHidden();
  await expect(failure.getByRole("button")).toHaveCount(2);
  await page.screenshot({
    path: testInfo.outputPath("phone-light-failure.png"),
  });
});

for (const viewport of viewports) {
  for (const theme of ["light", "dark"] as const) {
    test(`real session B: ${viewport.name} ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await startFixture(page);
      const stage = page.getByTestId("training-sense-card-stage");
      await expect(stage).toHaveAttribute("data-side", "face");
      await page.evaluate(() => document.fonts.ready);
      const header = page.getByTestId("app-header");
      const session = page.getByTestId("training-session-chrome");
      await expect(session.getByText("TRAINING", { exact: true })).toHaveCount(
        0,
      );
      await expect(session.getByTestId("training-session-name")).toHaveCSS(
        "font-size",
        viewport.width <= 390 ? "14px" : "16px",
      );
      await expect(session.getByTestId("training-session-name")).toHaveCSS(
        "font-weight",
        "550",
      );
      await expect(
        session.getByRole("button", { name: "Geschiedenis" }),
      ).toBeVisible();
      await expect(
        session.getByRole("button", { name: "Sessie sluiten" }),
      ).toBeVisible();
      if (viewport.width <= 390) {
        await expect(header.getByRole("button", { name: "Instellingen" })).toHaveCount(0);
        await expect(header.getByRole("button", { name: /Thema:/ })).toHaveCount(0);
      } else {
        await expect(
          header.getByRole("button", { name: "Instellingen" }),
        ).toBeVisible();
        await expect(
          header.getByRole("button", { name: /Thema:/ }),
        ).toBeVisible();
      }
      const headerBox = await header.boundingBox();
      const sessionBox = (await session.boundingBox())!;
      const approvedInset = viewport.width >= 768 && viewport.height >= 700 ? 28 : 14;
      const topReference = headerBox ?? (await page.locator("main").boundingBox())!;
      expect(sessionBox.y - topReference.y - (headerBox?.height ?? 0)).toBeCloseTo(
        approvedInset,
        0,
      );
      expect(sessionBox.width).toBe(viewport.cardWidth);
      expect(sessionBox.height).toBe(62);
      for (const side of ["face", "answer"] as const) {
        if (side === "answer")
          await stage.getByRole("button", { name: "Antwoord tonen" }).click();
        const card = (await page
          .getByTestId("training-sense-card-shell")
          .boundingBox())!;
        expect(card.width).toBe(viewport.cardWidth);
        expect(card.x).toBe(sessionBox.x);
        expect(card.y - sessionBox.y - sessionBox.height).toBe(10);
        const dock = (await page
          .getByTestId("training-sense-card-dock")
          .boundingBox())!;
        expect(dock.y + dock.height).toBeLessThanOrEqual(viewport.height);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBe(viewport.width);
        expect(
          await page.evaluate(() => document.documentElement.scrollHeight),
        ).toBe(viewport.height);
        expect(
          await page
            .locator("html")
            .evaluate((el) => el.classList.contains("dark")),
        ).toBe(theme === "dark");
        await page.screenshot({
          path: testInfo.outputPath(`${viewport.name}-${theme}-${side}.png`),
        });
      }
      // Closing the session uses its real owner callback and leaves the card stage.
      await session.getByRole("button", { name: "Sessie sluiten" }).click();
      await expect(stage).toBeHidden();
      await expect(page.getByRole("heading", { name: "Training", level: 1 })).toBeVisible();
      await expect(page.getByRole("button", { name: /^Training (starten|hervatten)$/ })).toBeEnabled();
    });
  }
}
