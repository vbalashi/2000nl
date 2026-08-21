import { describe, expect, test, vi } from "vitest";
import {
  buildSenseCardDiagnosticReport,
  classifyDiagnosticReportResponse,
  deliverStoredDiagnosticReport,
  freezeSenseCardDiagnosticSnapshot,
  scheduleNearestDiagnosticReportRetry,
  type DiagnosticReportOutboxRecord,
  type DiagnosticReportOutboxStore,
} from "@/lib/feedback/diagnosticReportClient";
import { singleSenseEntry, singleSenseGroup } from "./platformV2TrainingFixture";

const entryId = "11111111-1111-4111-8111-111111111111";
const reportRevision = "a".repeat(64);
const principalId = "99999999-9999-4999-8999-999999999999";

function snapshot() {
  return freezeSenseCardDiagnosticSnapshot({
    route: "training",
    group: singleSenseGroup,
    entry: {
      ...singleSenseEntry,
      entryId,
      reportContentRevision: reportRevision,
      contentNodes: singleSenseEntry.contentNodes.map((node, index) => ({
        ...node,
        contentNodeId: `node-${index}`,
        sourceTextFingerprint: "b".repeat(64),
        translations: [],
      })),
      translation: null,
    },
  });
}

function memoryStore(initial: DiagnosticReportOutboxRecord | null) {
  let saved = initial;
  const store: DiagnosticReportOutboxStore = {
    get: vi.fn(async () => saved),
    insertOrLoadExact: vi.fn(async (next) => {
      if (!saved) { saved = next; return saved; }
      return saved.principalId === next.principalId &&
        saved.report.payloadHash === next.report.payloadHash &&
        JSON.stringify(saved.report) === JSON.stringify(next.report)
        ? saved
        : null;
    }),
    list: vi.fn(async () => (saved ? [saved] : [])),
    claim: vi.fn(async (_id, owner, now, leaseToken, leaseUntil) => {
      if (!saved || saved.principalId !== owner || saved.expiresAt <= now ||
        (saved.leaseUntil !== null && saved.leaseUntil > now)) return null;
      saved = {
        ...saved,
        status: "sending",
        leaseToken,
        leaseUntil,
        attemptCount: saved.attemptCount + 1,
      };
      return saved;
    }),
    finish: vi.fn(async (_id, owner, leaseToken, result) => {
      if (!saved || saved.principalId !== owner || saved.leaseToken !== leaseToken) return false;
      if (result.kind === "accepted") saved = null;
      else if (result.kind === "permanent") saved = { ...saved, status: "rejected", leaseToken: null, leaseUntil: null };
      else saved = { ...saved, status: "retry_wait", retryAt: result.retryAt, leaseToken: null, leaseUntil: null };
      return true;
    }),
    purgeExpired: vi.fn(async (_id, now) => {
      if (!saved || saved.expiresAt > now) return false;
      saved = null;
      return true;
    }),
  };
  return { store, current: () => saved };
}

function outboxRecord(report: DiagnosticReportOutboxRecord["report"] = {} as DiagnosticReportOutboxRecord["report"]): DiagnosticReportOutboxRecord {
  return {
    reportId: "33333333-3333-4333-8333-333333333333",
    principalId,
    report,
    status: "queued",
    createdAt: 1,
    expiresAt: 1_000_000,
    attemptCount: 0,
    retryAt: 1,
    leaseToken: null,
    leaseUntil: null,
  };
}

describe("diagnostic report client", () => {
  test("freezes only the typed current card and builds a verifiable entry report", async () => {
    const frozen = snapshot();
    expect(frozen).not.toHaveProperty("group");
    expect(frozen.entry.entryId).toBe(entryId);

    const report = await buildSenseCardDiagnosticReport({
      snapshot: frozen,
      kind: "translation-quality",
      comment: "  onjuiste vertaling  ",
      now: new Date("2026-08-21T08:00:00.000Z"),
      reportId: "22222222-2222-4222-8222-222222222222",
      environment: {
        timezoneOffsetMinutes: -180,
        timezoneName: "Europe/Moscow",
        browserFamily: "chromium",
        browserMajorVersion: 140,
        osFamily: "macos",
        osMajorVersion: 15,
        isPwa: false,
        isOnline: true,
      },
    });

    expect(report.target).toEqual({
      kind: "entry",
      entryId,
      contentRevision: reportRevision,
    });
    expect(report.feedback).toEqual({
      kind: "translation-quality",
      problemType: "other-translation",
      comment: "onjuiste vertaling",
    });
    expect(report.cardContent?.atoms.map((atom) => atom.role)).toEqual([
      "headword",
      "definition",
      "example",
    ]);
  });

  test("deletes only an accepted record and retains transient failures for retry", async () => {
    const report = await buildSenseCardDiagnosticReport({
      snapshot: snapshot(),
      kind: "other",
      comment: null,
      now: new Date("2026-08-21T08:00:00.000Z"),
      reportId: "33333333-3333-4333-8333-333333333333",
      environment: {
        timezoneOffsetMinutes: 0,
        timezoneName: "UTC",
        browserFamily: "unknown",
        browserMajorVersion: null,
        osFamily: "unknown",
        osMajorVersion: null,
        isPwa: false,
        isOnline: true,
      },
    });
    const initial = { ...outboxRecord(report), reportId: report.reportId };
    const { store, current } = memoryStore(initial);
    const transient = await deliverStoredDiagnosticReport({
      store,
      record: initial,
      principalId,
      now: 10,
      send: vi.fn(async () => ({ kind: "temporary" as const })),
    });
    expect(transient).toBe("scheduled");
    expect(current()?.status).toBe("retry_wait");

    const sent = await deliverStoredDiagnosticReport({
      store,
      record: current()!,
      principalId,
      now: 70_000,
      send: vi.fn(async () => ({ kind: "accepted" as const })),
    });
    expect(sent).toBe("sent");
    expect(current()).toBeNull();
  });

  test("binds a training-action report to the frozen request identity and observed outcome", async () => {
    const frozen = freezeSenseCardDiagnosticSnapshot({
      route: "training",
      group: singleSenseGroup,
      entry: {
        ...singleSenseEntry,
        entryId,
        reportContentRevision: reportRevision,
        translation: null,
        contentNodes: singleSenseEntry.contentNodes.map((node) => ({
          ...node,
          translations: [],
        })),
      },
      operation: {
        request: {
          actionId: "review-card",
          clientEventId: "33333333-3333-4333-8333-333333333333",
          target: {
            kind: "sense-card",
            entryId,
            cardTypeId: "word-to-definition",
            stateRevision: "44444444-4444-4444-8444-444444444444",
          },
          reviewResult: "hard",
        },
        observedOutcome: "timeout",
      },
    });

    const report = await buildSenseCardDiagnosticReport({
      snapshot: frozen,
      kind: "training-action",
      comment: null,
      now: new Date("2026-08-21T08:00:00.000Z"),
      reportId: "55555555-5555-4555-8555-555555555555",
      environment: {
        timezoneOffsetMinutes: 0,
        timezoneName: "UTC",
        browserFamily: "unknown",
        browserMajorVersion: null,
        osFamily: "unknown",
        osMajorVersion: null,
        isPwa: false,
        isOnline: true,
      },
    });

    expect(report.target).toEqual({
      kind: "training-action",
      entryId,
      cardTypeId: "word-to-definition",
      stateRevision: "44444444-4444-4444-8444-444444444444",
      contentRevision: reportRevision,
      actionId: "review-card",
      clientEventId: "33333333-3333-4333-8333-333333333333",
      reviewResult: "hard",
      activeKnownMarkId: null,
      knownMarkRevision: null,
    });
    expect(report.observations.actionObservation).toEqual({
      clientObservedOutcome: "timeout",
    });
  });

  test("uses canonical entry-first then node-order translation atoms without selecting an arbitrary node", async () => {
    const sourceContentFingerprint = "c".repeat(64);
    const nodeFingerprints = ["d".repeat(64), "e".repeat(64)];
    const entry = {
      ...singleSenseEntry,
      entryId,
      reportContentRevision: reportRevision,
      translation: {
        translationId: "66666666-6666-4666-8666-666666666666",
        entryId,
        targetLanguageCode: "en",
        status: "ready" as const,
        text: "entry first",
        sourceContentFingerprint,
        translationPolicyVersion: "policy-1",
        providerRevision: "provider-1",
        isFresh: true,
      },
      contentNodes: singleSenseEntry.contentNodes.map((node, index) => ({
        ...node,
        contentNodeId: `node-${index}`,
        order: 1 - index,
        sourceTextFingerprint: nodeFingerprints[index]!,
        translations: [{
          translationId: String(index + 7).repeat(64),
          targetLanguageCode: "en",
          status: "ready" as const,
          text: `node order ${1 - index}`,
          sourceTextFingerprint: nodeFingerprints[index]!,
          translationPolicyVersion: "policy-1",
          providerRevision: "provider-1",
        }],
      })),
      capabilities: [{
        actionId: "report-content" as const,
        elementId: "sense-card.report.translation",
        messageKey: "senseCard.report",
        target: {
          kind: "translation" as const,
          targetKind: "entry" as const,
          entryId,
          contentNodeId: null,
          translationId: "66666666-6666-4666-8666-666666666666",
          targetLanguageCode: "en",
          sourceContentFingerprint,
          translationPolicyVersion: "policy-1",
          providerRevision: "provider-1",
        },
      }],
    };
    const report = await buildSenseCardDiagnosticReport({
      snapshot: freezeSenseCardDiagnosticSnapshot({
        route: "training", group: singleSenseGroup, entry,
      }),
      kind: "translation-quality",
      comment: null,
      reportId: "88888888-8888-4888-8888-888888888888",
    });

    expect(report.target).toEqual({ kind: "entry", entryId, contentRevision: reportRevision });
    expect(report.cardContent?.atoms.filter((atom) => atom.role === "displayed-translation")
      .map((atom) => atom.text)).toEqual([
      "entry first",
      "node order 0",
      "node order 1",
    ]);
  });

  test("retains a permanent rejection on the same report identity", async () => {
    const record = outboxRecord();
    const { store, current } = memoryStore(record);
    await expect(deliverStoredDiagnosticReport({
      store,
      record,
      principalId,
      now: 10,
      send: vi.fn(async () => ({ kind: "permanent" as const })),
    })).resolves.toBe("rejected");
    expect(current()?.status).toBe("rejected");
    expect(current()?.reportId).toBe(record.reportId);
  });

  test("allows only one sender to hold the report lease", async () => {
    const initial = outboxRecord();
    const send = vi.fn(async () => ({ kind: "temporary" as const }));
    const { store } = memoryStore(initial);
    await Promise.all([
      deliverStoredDiagnosticReport({ store, record: initial, principalId, now: 10, send }),
      deliverStoredDiagnosticReport({ store, record: initial, principalId, now: 10, send }),
    ]);
    expect(send).toHaveBeenCalledOnce();
  });

  test("an exact retry cannot overwrite an existing lease, TTL, or backoff", async () => {
    const existing = {
      ...outboxRecord(),
      status: "sending" as const,
      retryAt: 77_000,
      expiresAt: 88_000,
      leaseToken: "active-lease",
      leaseUntil: 99_000,
      attemptCount: 4,
    };
    const { store, current } = memoryStore(existing);
    await expect(store.insertOrLoadExact({
      ...existing,
      status: "queued",
      retryAt: 1,
      expiresAt: 999_000,
      leaseToken: null,
      leaseUntil: null,
      attemptCount: 0,
    })).resolves.toEqual(existing);
    expect(current()).toEqual(existing);
    await expect(store.insertOrLoadExact({
      ...existing,
      principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    })).resolves.toBeNull();
    expect(current()).toEqual(existing);
  });

  test("never sends one principal's report while another principal is active", async () => {
    const record = outboxRecord();
    const { store, current } = memoryStore(record);
    const send = vi.fn(async () => ({ kind: "accepted" as const }));
    await expect(deliverStoredDiagnosticReport({
      store,
      record,
      principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      now: 10,
      send,
    })).resolves.toBe("queued");
    expect(send).not.toHaveBeenCalled();
    expect(current()).toEqual(record);
  });

  test("an expired lease owner cannot delete or resurrect a newer owner's result", async () => {
    const record = outboxRecord();
    const { store, current } = memoryStore(record);
    let resolveFirst!: (result: { kind: "temporary" }) => void;
    const firstSend = vi.fn(() => new Promise<{ kind: "temporary" }>((resolve) => {
      resolveFirst = resolve;
    }));
    const first = deliverStoredDiagnosticReport({
      store, record, principalId, now: 10, send: firstSend,
    });
    await vi.waitFor(() => expect(firstSend).toHaveBeenCalledOnce());
    await expect(deliverStoredDiagnosticReport({
      store,
      record: current()!,
      principalId,
      now: 30_011,
      send: vi.fn(async () => ({ kind: "accepted" as const })),
    })).resolves.toBe("sent");
    resolveFirst({ kind: "temporary" });
    await expect(first).resolves.toBe("queued");
    expect(current()).toBeNull();
  });

  test("purges an expired record without sending", async () => {
    const record = { ...outboxRecord(), expiresAt: 10 };
    const { store, current } = memoryStore(record);
    const send = vi.fn(async () => ({ kind: "accepted" as const }));
    await expect(deliverStoredDiagnosticReport({
      store, record, principalId, now: 10, send,
    })).resolves.toBe("rejected");
    expect(send).not.toHaveBeenCalled();
    expect(current()).toBeNull();
  });

  test("schedules the nearest active retry at its bounded due time", () => {
    vi.useFakeTimers();
    const onDue = vi.fn();
    const cancel = scheduleNearestDiagnosticReportRetry({
      records: [
        { ...outboxRecord(), status: "retry_wait", retryAt: 2_000 },
        { ...outboxRecord(), reportId: "44444444-4444-4444-8444-444444444444", status: "retry_wait", retryAt: 1_000 },
      ],
      principalId,
      now: 100,
      onDue,
    });
    vi.advanceTimersByTime(899);
    expect(onDue).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDue).toHaveBeenCalledOnce();
    cancel();
    vi.useRealTimers();
  });

  test("starts the retry floor at send completion and never jitters below 60 seconds", async () => {
    const record = outboxRecord();
    const { store, current } = memoryStore(record);
    await deliverStoredDiagnosticReport({
      store,
      record,
      principalId,
      now: 1_000,
      completedAt: () => 6_000,
      random: () => 0,
      send: vi.fn(async () => ({ kind: "temporary" as const })),
    });
    expect(current()?.retryAt).toBe(66_000);
  });

  test("clamps high-attempt positive jitter to one hour after send completion", async () => {
    const record = { ...outboxRecord(), attemptCount: 20 };
    const { store, current } = memoryStore(record);
    await deliverStoredDiagnosticReport({
      store,
      record,
      principalId,
      now: 1_000,
      completedAt: () => 6_000,
      random: () => 1,
      send: vi.fn(async () => ({ kind: "temporary" as const })),
    });
    expect(current()?.retryAt).toBe(3_606_000);
  });

  test("deletes only after a verified accepted or duplicate receipt for the same report", async () => {
    const reportId = "33333333-3333-4333-8333-333333333333";
    await expect(classifyDiagnosticReportResponse(new Response(JSON.stringify({
      status: "accepted",
      reportId,
    }), { status: 200 }), reportId)).resolves.toEqual({ kind: "accepted" });
    await expect(classifyDiagnosticReportResponse(new Response(JSON.stringify({
      status: "duplicate",
      reportId,
    }), { status: 200 }), reportId)).resolves.toEqual({ kind: "accepted" });
    await expect(classifyDiagnosticReportResponse(new Response(JSON.stringify({
      status: "accepted",
      reportId: "44444444-4444-4444-8444-444444444444",
    }), { status: 200 }), reportId)).resolves.toEqual({ kind: "temporary" });
    await expect(classifyDiagnosticReportResponse(new Response("{}", {
      status: 200,
    }), reportId)).resolves.toEqual({ kind: "temporary" });
  });
});
