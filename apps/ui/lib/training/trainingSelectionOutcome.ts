import type { TrainingSelectionFailureKind } from "./trainingSelectionFailure";

export type TrainingEmptySelectionOutcome = "no-match" | "session-complete";

export type TrainingSelectionLoadFailure =
  | "statement-timeout"
  | "request-cancelled"
  | "network-error"
  | "selection-error";

export type LoadNextTrainingTurnResult =
  | "loaded"
  | TrainingEmptySelectionOutcome
  | TrainingSelectionLoadFailure
  | "error"
  | "skipped";

export const trainingSelectionFailureOutcome = (
  kind: TrainingSelectionFailureKind,
): TrainingSelectionLoadFailure => {
  switch (kind) {
    case "statement-timeout":
      return "statement-timeout";
    case "request-cancelled":
      return "request-cancelled";
    case "network":
      return "network-error";
    case "database":
      return "selection-error";
  }
};

export const isTrainingLoadFailure = (
  result: LoadNextTrainingTurnResult,
): result is TrainingSelectionLoadFailure | "error" =>
  result === "statement-timeout" ||
  result === "request-cancelled" ||
  result === "network-error" ||
  result === "selection-error" ||
  result === "error";
