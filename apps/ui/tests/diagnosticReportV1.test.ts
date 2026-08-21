import { describe, expect, test } from "vitest";
import {
  buildDiagnosticReport,
  canonicalJson,
  DIAGNOSTIC_REPORT_MAX_BYTES,
  parseDiagnosticReportTransport,
  verifyDiagnosticTransport,
} from "../../../packages/shared/diagnostic-report/v1";

const reportId = "11111111-1111-4111-8111-111111111111";
const correlationId = "22222222-2222-4222-8222-222222222222";

const observations = () => ({
  capturedAt: "2026-08-20T10:00:00.000Z",
  timezoneOffsetMinutes: 180,
  timezoneName: "Europe/Moscow",
  route: "training" as const,
  browserFamily: "chromium" as const,
  browserMajorVersion: 140,
  osFamily: "android" as const,
  osMajorVersion: 16,
  isPwa: true,
  isOnline: true,
  correlationIds: [correlationId],
  errorChain: [{
    category: "network" as const,
    stage: "report-send" as const,
    safeCode: "network-interrupted" as const,
    httpStatus: null,
    correlationId,
    appFrameFingerprints: ["a".repeat(64)],
  }],
  recentEvents: [],
  omittedEventCount: 0,
  actionObservation: null,
});

async function validReport() {
  return buildDiagnosticReport({
    reportId,
    feedback: { kind: "loading", problemType: "loading-failure", comment: "Intermittent wait" },
    target: { kind: "app-operation", route: "training", stage: "lookup-fetch", operationCorrelationId: correlationId, entryId: null },
    sourceContext: null,
    cardContent: null,
    observations: observations(),
  });
}

describe("Diagnostic Report v1", () => {
  test("builds a canonical bounded transport with a verified hash", async () => {
    const report = await validReport();
    expect(parseDiagnosticReportTransport(report)).toEqual({ ok: true, value: report });
    await expect(verifyDiagnosticTransport(report)).resolves.toBe(true);
    const { payloadHash: _payloadHash, ...payload } = report;
    expect(new TextEncoder().encode(canonicalJson(payload)).byteLength)
      .toBeLessThanOrEqual(DIAGNOSTIC_REPORT_MAX_BYTES);
  });

  test.each(["token", "cookie", "headers", "url", "dom", "storage", "console", "network", "errorMessage"])(
    "rejects forbidden automatic field %s rather than trying to redact it",
    async (field) => {
      const report: any = await validReport();
      report.observations[field] = "secret";
      expect(parseDiagnosticReportTransport(report)).toEqual({ ok: false, error: "invalid_observations" });
    },
  );

  test("rejects a mismatched category/problem pair and oversized comment", async () => {
    const report: any = await validReport();
    report.feedback.problemType = "wrong-sense";
    expect(parseDiagnosticReportTransport(report)).toEqual({ ok: false, error: "invalid_feedback" });
    report.feedback.problemType = "loading-failure";
    report.feedback.comment = "🙂".repeat(1001);
    expect(parseDiagnosticReportTransport(report)).toEqual({ ok: false, error: "invalid_feedback" });
  });

  test("rejects source-context unknown keys at every nesting boundary", async () => {
    const report: any = await validReport();
    report.sourceContext = {
      contractVersion: "diagnostic-source-context-v1",
      source: { kind: "youtube_video", provider: "youtube", externalId: "4EE7m94mJpk", languageCode: "nl", url: "https://secret.invalid/?token=x" },
      location: null,
    };
    expect(parseDiagnosticReportTransport(report)).toEqual({ ok: false, error: "invalid_source_context" });
  });

  test("accepts the exact bounded YouTube source-context projection", async () => {
    const report: any = await validReport();
    report.sourceContext = {
      contractVersion: "diagnostic-source-context-v1",
      source: { kind: "youtube_video", provider: "youtube", externalId: "4EE7m94mJpk", languageCode: "nl" },
      location: { kind: "caption_phrase", startMs: 1000, endMs: 2500, phraseIndex: 3, locatorConfidence: "canonical" },
    };
    expect(parseDiagnosticReportTransport(report).ok).toBe(true);
  });

  test("accepts Platform identifier contentNodeId values rather than requiring UUIDs", async () => {
    const report: any = await validReport();
    report.target = { kind: "content-node", entryId: reportId, contentNodeId: "node.definition:primary", nodeKind: "definition", sourceTextFingerprint: "b".repeat(64) };
    report.cardContent = { atoms: [{ role: "definition", contentNodeId: "node.definition:primary", text: "betekenis", truncated: false }], omittedAtomCount: 0 };
    expect(parseDiagnosticReportTransport(report).ok).toBe(true);
  });

  test("rejects duplicate atoms", async () => {
    const report: any = await validReport();
    report.target = { kind: "entry", entryId: reportId, contentRevision: "revision-1" };
    const atom = { role: "headword", contentNodeId: null, text: "woord", truncated: false };
    report.cardContent = { atoms: [atom, { ...atom }], omittedAtomCount: 0 };
    expect(parseDiagnosticReportTransport(report)).toEqual({ ok: false, error: "invalid_card_content" });
  });

  test("rejects non-canonical target UUIDs and stale-card borrowing for app operations", async () => {
    const report: any = await validReport();
    report.target.operationCorrelationId = "A2222222-2222-4222-8222-222222222222";
    expect(parseDiagnosticReportTransport(report)).toEqual({ ok: false, error: "invalid_target" });
    const second: any = await validReport();
    second.cardContent = { atoms: [], omittedAtomCount: 0 };
    expect(parseDiagnosticReportTransport(second)).toEqual({ ok: false, error: "invalid_card_content" });
  });

  test.each([
    { kind: "entry", entryId: reportId, contentRevision: "revision-1" },
    { kind: "sense-card", entryId: reportId, cardTypeId: "word-to-definition", contentRevision: "revision-1", stateRevision: "untracked" },
    { kind: "content-node", entryId: reportId, contentNodeId: correlationId, nodeKind: "definition", sourceTextFingerprint: "b".repeat(64) },
    { kind: "translation-artifact", targetKind: "entry", entryId: reportId, contentNodeId: null, translationId: correlationId, sourceContentFingerprint: "b".repeat(64), sourceTextFingerprint: null, targetLanguageCode: "en", translationPolicyVersion: "policy-1", providerRevision: null },
    { kind: "translation-artifact", targetKind: "content-node", entryId: reportId, contentNodeId: correlationId, translationId: "33333333-3333-4333-8333-333333333333", sourceContentFingerprint: null, sourceTextFingerprint: "b".repeat(64), targetLanguageCode: "ru", translationPolicyVersion: "policy-1", providerRevision: "provider-1" },
    { kind: "training-action", entryId: reportId, cardTypeId: "word-to-definition", stateRevision: "untracked", contentRevision: "revision-1", actionId: "review-card", clientEventId: correlationId, reviewResult: "hard", activeKnownMarkId: null, knownMarkRevision: null },
  ])("accepts the exact stable target union for $kind", async (target) => {
    const report: any = await validReport();
    report.target = target;
    report.cardContent = { atoms: [{ role: "headword", contentNodeId: null, text: "woord", truncated: false }], omittedAtomCount: 0 };
    report.observations.actionObservation = target.kind === "training-action"
      ? { clientObservedOutcome: "timeout" }
      : null;
    expect(parseDiagnosticReportTransport(report).ok).toBe(true);
  });

  test("clips atoms by scalar and count limits while preserving omission evidence", async () => {
    const report = await buildDiagnosticReport({
      reportId,
      feedback: { kind: "content-quality", problemType: "wrong-sense", comment: null },
      target: { kind: "entry", entryId: reportId, contentRevision: "revision-1" },
      sourceContext: null,
      cardContent: { atoms: Array.from({ length: 40 }, (_, index) => ({
        role: index === 0 ? "headword" as const : "definition" as const,
        contentNodeId: index === 0 ? null : `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`,
        text: "🙂".repeat(2_000),
      })) },
      observations: observations(),
    });
    expect(report.cardContent?.atoms.length).toBeLessThanOrEqual(32);
    expect(report.cardContent?.atoms[0].truncated).toBe(true);
    expect((report.cardContent?.atoms.length ?? 0) + (report.cardContent?.omittedAtomCount ?? 0)).toBe(40);
    expect(parseDiagnosticReportTransport(report).ok).toBe(true);
  });
});
