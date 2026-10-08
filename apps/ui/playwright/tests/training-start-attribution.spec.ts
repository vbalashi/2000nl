import { expect, test } from "@playwright/test";
import {
  installTrainingAttributionCollector,
  readTrainingAttributionCapture,
  setupAuthenticatedTrainingAttributionPage,
} from "../support/trainingAttributionHarness";

test.skip(process.env.APP_ROLLOUT_PROFILE !== "pilot", "Requires pilot Training UI.");

test("ordinary Start correlates scope, session and first visible card without answering", async ({ page }) => {
  await installTrainingAttributionCollector(page);
  const fixture = await setupAuthenticatedTrainingAttributionPage(page, 0, {
    sessionPlannedTotal: 2,
  });
  for (const rpc of ["update_active_training_scope", "start_training_session"]) {
    await page.route(`**/rpc/${rpc}`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.fallback();
    });
  }
  await page.getByRole("button", { name: /^(Start training|Training starten|Начать тренировку)$/ }).click();
  await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
  await expect.poll(async () => (await readTrainingAttributionCapture(page)).timings.filter(
    (event) => event.stage === "transition.total" && event.outcome === "start-ready",
  ).length).toBe(1);
  const capture = await readTrainingAttributionCapture(page);
  const total = capture.timings.find((event) => event.stage === "transition.total" && event.outcome === "start-ready")!;
  const events = capture.timings.filter((event) => event.transitionId === total.transitionId);
  const stage = (name: string) => {
    const event = events.find((event) => event.stage === name);
    expect(event, name).toBeDefined();
    return event!;
  };
  expect(stage("transition.start").outcome).toBe("start");
  const scope = stage("training.scope-commit");
  const session = stage("training.session-start");
  const selection = stage("next-card.selection");
  const lookup = stage("next-card.lookup");
  const render = stage("card.render");
  expect(scope.durationMs).toBeGreaterThanOrEqual(200);
  expect(session.durationMs).toBeGreaterThanOrEqual(200);
  expect(total.durationMs).toBeGreaterThanOrEqual(400);
  expect(scope.monotonicEndedAtMs).toBeLessThanOrEqual(session.monotonicStartedAtMs);
  expect(session.monotonicEndedAtMs).toBeLessThanOrEqual(selection.monotonicStartedAtMs);
  expect(lookup.monotonicEndedAtMs).toBeLessThanOrEqual(render.monotonicEndedAtMs);
  expect(render.monotonicEndedAtMs).toBe(total.monotonicEndedAtMs);
  expect(events.filter((event) => event.stage === "transition.total")).toHaveLength(1);
  expect(events.some((event) => event.stage.startsWith("review."))).toBe(false);
  expect(fixture.requests.sessionStarts).toHaveLength(1);
});

test("leaving Training during Start cancels visibility timing without cancelling the session", async ({ page }) => {
  await installTrainingAttributionCollector(page);
  const fixture = await setupAuthenticatedTrainingAttributionPage(page, 0, { sessionPlannedTotal: 2 });
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let requested = false;
  await page.route("**/rpc/start_training_session", async (route) => {
    requested = true;
    await held;
    await route.fallback();
  });
  await page.getByRole("button", { name: /^(Start training|Training starten|Начать тренировку)$/ }).click();
  await expect.poll(() => requested).toBe(true);
  await page.getByRole("button", { name: /^Library$|^Библиотека$|^Bibliotheek$/ }).first().click();
  await expect.poll(async () => (await readTrainingAttributionCapture(page)).timings.filter(
    (event) => event.stage === "transition.total" && event.outcome === "start-cancelled",
  ).length).toBe(1);
  release();
  await expect.poll(() => fixture.requests.sessionStarts.length).toBe(1);
  // Wait for actual preparation/render to settle even though its container is hidden.
  await expect.poll(async () => (await readTrainingAttributionCapture(page)).timings.some(
    (event) => event.stage === "card.render",
  )).toBe(true);
  const capture = await readTrainingAttributionCapture(page);
  const totals = capture.timings.filter((event) => event.stage === "transition.total" && event.outcome.startsWith("start-"));
  expect(totals.map((event) => event.outcome)).toEqual(["start-cancelled"]);
  expect(capture.timings.some((event) => event.stage.startsWith("review."))).toBe(false);
});
