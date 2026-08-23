export type TrainingSelectionFailureKind =
  | "statement-timeout"
  | "request-cancelled"
  | "network"
  | "database";

type ErrorLike = {
  code?: unknown;
  message?: unknown;
  name?: unknown;
  details?: unknown;
  hint?: unknown;
};

const asErrorLike = (cause: unknown): ErrorLike =>
  cause && typeof cause === "object" ? (cause as ErrorLike) : {};

export const classifyTrainingSelectionFailure = (
  cause: unknown,
): TrainingSelectionFailureKind => {
  const candidate = asErrorLike(cause);
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const evidence = [candidate.message, candidate.details, candidate.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  const name = typeof candidate.name === "string" ? candidate.name : "";

  if (evidence.includes("statement timeout")) {
    return "statement-timeout";
  }
  if (
    name === "AbortError" ||
    code === "ABORT_ERR" ||
    (code === "57014" && evidence.includes("user request"))
  ) {
    return "request-cancelled";
  }
  if (
    cause instanceof TypeError ||
    name === "TypeError" ||
    evidence.includes("fetch failed") ||
    evidence.includes("failed to fetch") ||
    evidence.includes("network request")
  ) {
    return "network";
  }
  return "database";
};

export class TrainingSelectionFailure extends Error {
  readonly kind: TrainingSelectionFailureKind;
  readonly code?: string;

  constructor(cause: unknown) {
    const candidate = asErrorLike(cause);
    const message =
      typeof candidate.message === "string"
        ? candidate.message
        : "training_selection_failed";
    super(message, { cause });
    this.name = "TrainingSelectionFailure";
    this.kind = classifyTrainingSelectionFailure(cause);
    if (typeof candidate.code === "string") this.code = candidate.code;
  }
}

export const normalizeTrainingSelectionFailure = (
  cause: unknown,
): TrainingSelectionFailure =>
  cause instanceof TrainingSelectionFailure
    ? cause
    : new TrainingSelectionFailure(cause);
