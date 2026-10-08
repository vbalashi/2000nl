import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import {
  installTrainingAttributionCollector,
  setupAuthenticatedTrainingAttributionPage,
} from "../support/trainingAttributionHarness";

const SAMPLE_COUNT = 5;
const profiles = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;
const compositions = [
  { name: "serialized", lookupDelayMs: 500 },
  { name: "overlapped", lookupDelayMs: 300 },
] as const;

test("models serialized versus overlapped exact lookup composition without optimistic card advance", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const results: Array<{
    profile: string;
    composition: string;
    injectedLookupCompositionMs: number;
    durationsMs: number[];
    summary: ReturnType<typeof summarize>;
    preservedAnswerCardDuringLookup: boolean;
  }> = [];

  for (const profile of profiles) {
    for (const composition of compositions) {
      const page = await browser.newPage({ viewport: profile });
      await installTrainingAttributionCollector(page);
      const fixture = await setupAuthenticatedTrainingAttributionPage(page, 0, {
        bootstrapReadDelayMs: 0,
        lookupDelayMs: composition.lookupDelayMs,
        forceOnDemandLookupEveryAction: true,
      });
      await page
        .getByRole("button", {
          name: /^(?:Start training|Training starten|Начать тренировку)$/,
        })
        .click();
      const card = page.getByTestId("training-sense-card-v2");
      await expect(card).toBeVisible();
      fixture.beginMeasuredTransitions();
      const durationsMs: number[] = [];
      const actionEntryIds: string[] = [];
      const displayedHeadwords = new Set<string>();
      const presentedNextHeadwords: string[] = [];

      for (let sample = 0; sample <= SAMPLE_COUNT; sample += 1) {
        await page
          .getByRole("button", {
            name: /Antwoord Tonen|Показать ответ|Show answer/i,
          })
          .click();
        const headword = card.locator('h2[aria-label]').first();
        const before = await headword.getAttribute("aria-label");
        expect(before).toBeTruthy();
        displayedHeadwords.add(before!);
        const action = page.getByRole("button", {
          name: /Begin met leren|Учить|Start learning|Goed|Хорошо|Good/i,
        });
        const startedAt = performance.now();
        await action.click();
        await page.waitForTimeout(100);
        await expect(headword).toHaveAttribute("aria-label", before ?? "");
        await page.waitForFunction(
          (previousHeadword) => {
            const card = document.querySelector(
              '[data-testid="training-sense-card-v2"]',
            );
            const nextHeadword = card?.querySelector('h2[aria-label]');
            const nextLabel = nextHeadword?.getAttribute("aria-label");
            return Boolean(nextLabel && nextLabel !== previousHeadword);
          },
          before,
        );
        await expect(card).toBeVisible();
        const nextHeadword = await card
          .locator('h2[aria-label]')
          .first()
          .getAttribute("aria-label");
        expect(nextHeadword).toBeTruthy();
        expect(nextHeadword).not.toBe(before);
        displayedHeadwords.add(nextHeadword!);
        presentedNextHeadwords.push(nextHeadword!);
        const target = fixture.requests.progressActions[sample]?.target as
          | { kind: string; entryId: string }
          | undefined;
        expect(target).toMatchObject({ kind: "sense-card" });
        expect(typeof target?.entryId).toBe("string");
        actionEntryIds.push(target!.entryId);
        const durationMs = Number((performance.now() - startedAt).toFixed(1));
        if (sample > 0) durationsMs.push(durationMs);
      }
      expect(fixture.requests.progressActions).toHaveLength(SAMPLE_COUNT + 1);
      expect(actionEntryIds).toHaveLength(SAMPLE_COUNT + 1);
      expect(new Set(actionEntryIds).size).toBe(SAMPLE_COUNT + 1);
      expect(displayedHeadwords.size).toBe(SAMPLE_COUNT + 2);
      expect(presentedNextHeadwords).toHaveLength(SAMPLE_COUNT + 1);
      expect(new Set(presentedNextHeadwords).size).toBe(SAMPLE_COUNT + 1);

      results.push({
        profile: profile.name,
        composition: composition.name,
        injectedLookupCompositionMs: composition.lookupDelayMs,
        durationsMs,
        summary: summarize(durationsMs),
        preservedAnswerCardDuringLookup: true,
      });
      await page.close();
    }
  }

  for (const profile of profiles) {
    const serialized = results.find(
      (result) => result.profile === profile.name && result.composition === "serialized",
    )!;
    const overlapped = results.find(
      (result) => result.profile === profile.name && result.composition === "overlapped",
    )!;
    expect(serialized.summary.p50 - overlapped.summary.p50).toBeGreaterThan(120);
    expect(serialized.preservedAnswerCardDuringLookup).toBe(true);
    expect(overlapped.preservedAnswerCardDuringLookup).toBe(true);
  }

  const report = {
    schemaVersion: "issue-207-browser-lookup-composition-v1",
    model: {
      serializedMs: 500,
      overlappedMs: 300,
      statement:
        "The fixture models the route-contract test's measured 200ms state plus 300ms translation critical path; it is not post-rollout production latency.",
    },
    sampleCount: SAMPLE_COUNT,
    profiles,
    results,
    identity: buildSourceIdentity(),
  };
  const attachmentPath = testInfo.outputPath("issue-207-browser-lookup-composition.json");
  await writeFile(attachmentPath, JSON.stringify(report, null, 2), "utf8");
  await testInfo.attach("issue-207-browser-lookup-composition.json", {
    path: attachmentPath,
    contentType: "application/json",
  });
  if (process.env.ISSUE_207_BROWSER_EVIDENCE_PATH) {
    await writeFile(
      process.env.ISSUE_207_BROWSER_EVIDENCE_PATH,
      JSON.stringify(report, null, 2) + "\n",
      "utf8",
    );
  }
});

function summarize(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const percentile = (fraction: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]!;
  return {
    count: sorted.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: sorted.at(-1)!,
  };
}

function buildSourceIdentity() {
  const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();
  const relevantPaths = [
    "apps/ui/lib/platform/platformV2LookupService.ts",
    "apps/ui/tests/api/platformV2LookupRoute.test.ts",
    "apps/ui/playwright/support/trainingAttributionHarness.ts",
    "apps/ui/playwright/tests/training-lookup-composition.spec.ts",
  ];
  const hash = (value: string | Buffer) =>
    createHash("sha256").update(value).digest("hex");
  return {
    appCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim(),
    relevantPaths,
    relevantSourceSha256: hash(
      relevantPaths
        .map((path) => `${path}\0${readFileSync(`${repoRoot}/${path}`, "utf8")}\0`)
        .join(""),
    ),
    relevantPatchSha256: hash(
      execFileSync("git", ["diff", "--binary", "HEAD", "--", ...relevantPaths], {
        cwd: repoRoot,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      }),
    ),
  };
}
