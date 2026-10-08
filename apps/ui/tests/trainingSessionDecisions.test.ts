import { describe, expect, test } from "vitest";
import {
  classifyResumeSnapshot,
  decideAuthoritySnapshot,
  decideResumePreflight,
} from "@/components/training/trainingSessionDecisions";
import type { TrainingSessionResumeRecord } from "@/lib/training/sessionResumeStore";

const resume: TrainingSessionResumeRecord = {
  sessionId: "session-1", userId: "user-1", languageCode: "nl",
  listId: "list-1", listType: "curated", scenarioId: "understanding",
  modes: ["word-to-definition"], cardFilter: "both", newReviewRatio: 2,
  focusFilter: { dateWindow: "all" }, sessionSize: 5,
};
const ready = {
  languagesResolved: true, catalogError: false, permittedCodes: ["nl", "en"],
  currentLanguage: "nl", listHydrated: true, hydratedLanguage: "nl",
  listCatalogStatus: "ready" as const,
  availableLists: [{ id: "list-1", type: "curated" as const }],
};

describe("training session decisions", () => {
  test.each([
    [null, ready, { kind: "no-record" }],
    [resume, { ...ready, languagesResolved: false }, { kind: "wait", reason: "language-catalog" }],
    [resume, { ...ready, catalogError: true }, { kind: "retryable-error", reason: "language-catalog" }],
    [resume, { ...ready, permittedCodes: ["en"] }, { kind: "discard", reason: "language" }],
    [resume, { ...ready, currentLanguage: "en" }, { kind: "switch-language", language: "nl" }],
    [resume, { ...ready, listHydrated: false }, { kind: "wait", reason: "list-catalog" }],
    [resume, { ...ready, hydratedLanguage: "en" }, { kind: "wait", reason: "list-catalog" }],
    [resume, { ...ready, listCatalogStatus: "loading" }, { kind: "wait", reason: "list-catalog" }],
    [resume, { ...ready, listCatalogStatus: "error" }, { kind: "retryable-error", reason: "list-catalog" }],
    [resume, { ...ready, availableLists: [] }, { kind: "discard", reason: "list" }],
    [resume, ready, { kind: "fetch-snapshot" }],
  ] as const)("resume preflight decision", (record, input, expected) => {
    expect(decideResumePreflight(record, input)).toEqual(expected);
  });

  const snapshots: Array<[
    { runStatus?: string; members: Array<{ consumedAt: string | null; unavailableAt: string | null }> } | null,
    { kind: string },
  ]> = [
    [null, { kind: "missing" }],
    [{ runStatus: "active", members: [] }, { kind: "no-remaining-member" }],
    [{ runStatus: "superseded", members: [{ consumedAt: null, unavailableAt: null }] }, { kind: "superseded" }],
    [{ runStatus: "active", members: [{ consumedAt: "done", unavailableAt: null }] }, { kind: "no-remaining-member" }],
    [{ runStatus: "active", members: [{ consumedAt: null, unavailableAt: "gone" }] }, { kind: "no-remaining-member" }],
    [{ runStatus: "active", members: [{ consumedAt: null, unavailableAt: null }] }, { kind: "resumable" }],
  ];
  test.each(snapshots)("snapshot classification", (snapshot, expected) => {
    expect(classifyResumeSnapshot(snapshot)).toEqual(expected);
  });

  test.each([
    [null, null, { kind: "superseded" }],
    [{ runStatus: "superseded", planRevision: 4 }, { sessionId: "session-1", revision: 3 }, { kind: "superseded" }],
    [{ runStatus: "active", planRevision: 3 }, { sessionId: "session-1", revision: 3 }, { kind: "unchanged", revision: 3 }],
    [{ runStatus: "active", planRevision: 4 }, { sessionId: "session-1", revision: 3 }, { kind: "replan", revision: 4 }],
    [{ runStatus: "active", planRevision: 0 }, { sessionId: "session-other", revision: 8 }, { kind: "unchanged", revision: 0 }],
  ] as const)("authority snapshot decision", (snapshot, reconciled, expected) => {
    expect(decideAuthoritySnapshot(snapshot, "session-1", reconciled)).toEqual(expected);
  });
});
