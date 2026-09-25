import type { TrainingExclusionRequest } from "../../../../../packages/shared/types/trainingExclusion";
export type PendingExclusionUndo = {
  userId: string;
  request: Extract<TrainingExclusionRequest, { actionId: "restore-pair" }>;
};
let pending: PendingExclusionUndo | null = null;
const listeners = new Set<() => void>();
export const getExclusionUndo = () => pending;
export const subscribeExclusionUndo = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function rememberExclusionUndo(value: PendingExclusionUndo | null) {
  pending = value;
  listeners.forEach((listener) => listener());
}
