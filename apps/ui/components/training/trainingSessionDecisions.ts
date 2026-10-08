import type { TrainingSessionResumeRecord } from "@/lib/training/sessionResumeStore";
import type { TrainingSessionSnapshot } from "@/lib/trainingService";
import type { WordListSummary } from "@/lib/types";

export type ResumePreflightInput = {
  languagesResolved: boolean;
  catalogError: boolean;
  permittedCodes: readonly string[];
  currentLanguage: string;
  listHydrated: boolean;
  hydratedLanguage: string | null;
  listCatalogStatus: "loading" | "ready" | "error";
  availableLists: readonly Pick<WordListSummary, "id" | "type">[];
};

export type ResumePreflightDecision =
  | { kind: "no-record" }
  | { kind: "wait"; reason: "language-catalog" | "list-catalog" }
  | { kind: "retryable-error"; reason: "language-catalog" | "list-catalog" }
  | { kind: "discard"; reason: "language" | "list" }
  | { kind: "switch-language"; language: string }
  | { kind: "fetch-snapshot" };

export function decideResumePreflight(
  record: TrainingSessionResumeRecord | null,
  input: ResumePreflightInput,
): ResumePreflightDecision {
  if (!record) return { kind: "no-record" };
  if (!input.languagesResolved) return { kind: "wait", reason: "language-catalog" };
  if (input.catalogError) return { kind: "retryable-error", reason: "language-catalog" };
  if (!input.permittedCodes.includes(record.languageCode)) {
    return { kind: "discard", reason: "language" };
  }
  if (record.languageCode !== input.currentLanguage) {
    return { kind: "switch-language", language: record.languageCode };
  }
  if (
    !input.listHydrated ||
    input.hydratedLanguage !== record.languageCode ||
    input.listCatalogStatus === "loading"
  ) return { kind: "wait", reason: "list-catalog" };
  if (input.listCatalogStatus === "error") return { kind: "retryable-error", reason: "list-catalog" };
  if (
    record.listId !== null &&
    !input.availableLists.some((list) =>
      list.id === record.listId && list.type === record.listType,
    )
  ) return { kind: "discard", reason: "list" };
  return { kind: "fetch-snapshot" };
}

export type ResumeSnapshotClassification =
  | { kind: "missing" }
  | { kind: "superseded" }
  | { kind: "no-remaining-member" }
  | { kind: "resumable" };

export function classifyResumeSnapshot(
  snapshot: {
    runStatus?: string;
    members: readonly { consumedAt: string | null; unavailableAt: string | null }[];
  } | null,
): ResumeSnapshotClassification {
  if (!snapshot) return { kind: "missing" };
  if (snapshot.runStatus === "superseded") return { kind: "superseded" };
  if (!snapshot.members.some((member) => !member.consumedAt && !member.unavailableAt)) {
    return { kind: "no-remaining-member" };
  }
  return { kind: "resumable" };
}

export type AuthorityDecision =
  | { kind: "superseded" }
  | { kind: "unchanged"; revision: number }
  | { kind: "replan"; revision: number };

export function decideAuthoritySnapshot(
  snapshot: Pick<TrainingSessionSnapshot, "runStatus" | "planRevision"> | null,
  sessionId: string,
  reconciledPlan: { sessionId: string; revision: number } | null,
): AuthorityDecision {
  if (!snapshot || snapshot.runStatus === "superseded") return { kind: "superseded" };
  const revision = snapshot.planRevision ?? 0;
  const previousRevision = reconciledPlan?.sessionId === sessionId
    ? reconciledPlan.revision
    : 0;
  return revision === previousRevision
    ? { kind: "unchanged", revision }
    : { kind: "replan", revision };
}
