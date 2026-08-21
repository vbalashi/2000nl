import { expect, test, type Page } from "@playwright/test";
import {
  buildFakeSupabaseSession,
  installSupabaseSession,
} from "../utils/supabaseTestSession";

const profiles = [
  {
    name: "desktop-1280x900-light",
    viewport: { width: 1280, height: 900 },
    colorScheme: "light" as const,
  },
  {
    name: "desktop-1280x900-dark",
    viewport: { width: 1280, height: 900 },
    colorScheme: "dark" as const,
  },
  {
    name: "mobile-375x812-dark",
    viewport: { width: 375, height: 812 },
    colorScheme: "dark" as const,
  },
  {
    name: "mobile-390x844-dark",
    viewport: { width: 390, height: 844 },
    colorScheme: "dark" as const,
  },
  {
    name: "mobile-402x874-light",
    viewport: { width: 402, height: 874 },
    colorScheme: "light" as const,
  },
  {
    name: "mobile-412x915-dark",
    viewport: { width: 412, height: 915 },
    colorScheme: "dark" as const,
  },
];

async function holdSessionRefresh(page: Page) {
  const validSession = buildFakeSupabaseSession({
    id: "loading-qa-user",
    email: "loading-qa@2000nl.test",
  });
  const expiredSession = {
    ...validSession,
    expires_at: Math.floor(Date.now() / 1000) - 60,
    expires_in: 0,
  };
  let releaseRefresh: () => void = () => undefined;
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  let refreshRequested = false;

  await page.route("**/auth/v1/token**", async (route) => {
    refreshRequested = true;
    await refreshGate;
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validSession),
    });
  });
  await installSupabaseSession(page, expiredSession);
  await page.addInitScript(() => {
    window.localStorage.setItem("onboarding_language", "nl");
  });

  return {
    releaseRefresh,
    refreshRequested: () => refreshRequested,
  };
}

for (const profile of profiles) {
  test(`auth bootstrap keeps one Training shell on ${profile.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(profile.viewport);
    await page.emulateMedia({
      colorScheme: profile.colorScheme,
      reducedMotion: "reduce",
    });
    const refresh = await holdSessionRefresh(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect.poll(refresh.refreshRequested).toBe(true);

    const shell = page.getByTestId("training-bootstrap-shell");
    await expect(shell).toBeVisible();
    await expect(
      shell.getByRole("heading", { name: "Training laden" }),
    ).toBeVisible();
    await expect(shell).toContainText(
      "We controleren je sessie voordat Training opent.",
    );
    await expect(page.getByText("Laden…")).toHaveCount(0);
    await expect.poll(async () =>
      shell.evaluate((element) =>
        element.getAnimations().filter((animation) => animation.playState === "running")
          .length,
      ),
    ).toBe(0);
    const shellBox = await shell.boundingBox();
    const bootstrapHeaderBox = await shell.locator("header").boundingBox();
    expect(shellBox).not.toBeNull();
    expect(bootstrapHeaderBox).not.toBeNull();
    expect(shellBox!.x).toBe(0);
    expect(shellBox!.y).toBe(0);
    expect(shellBox!.width).toBe(profile.viewport.width);
    expect(shellBox!.height).toBe(profile.viewport.height);
    expect(
      await shell.evaluate(
        (element) => element.scrollWidth === element.clientWidth,
      ),
    ).toBe(true);
    await expect(page.getByText("1 error", { exact: true })).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`${profile.name}.png`),
      fullPage: true,
    });

    refresh.releaseRefresh();
    const destinationShell = page.locator("[data-training-pilot-surface]");
    await expect(destinationShell).toBeVisible();
    await expect(shell).toHaveCount(0);
    await expect(page.getByText("Laden…")).toHaveCount(0);
    const destinationBox = await destinationShell.boundingBox();
    const destinationHeaderBox = await destinationShell.locator(":scope > header").boundingBox();
    expect(destinationBox).not.toBeNull();
    expect(destinationHeaderBox).not.toBeNull();
    expect(destinationBox!.width).toBe(shellBox!.width);
    expect(destinationBox!.height).toBe(shellBox!.height);
    expect(destinationHeaderBox!.width).toBe(bootstrapHeaderBox!.width);
    expect(destinationHeaderBox!.height).toBe(bootstrapHeaderBox!.height);
    expect(destinationHeaderBox!.x - destinationBox!.x).toBe(
      bootstrapHeaderBox!.x - shellBox!.x,
    );
    expect(destinationHeaderBox!.y - destinationBox!.y).toBe(
      bootstrapHeaderBox!.y - shellBox!.y,
    );
  });
}
