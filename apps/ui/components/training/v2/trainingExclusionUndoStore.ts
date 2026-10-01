import type { TrainingExclusionRequest } from "../../../../../packages/shared/types/trainingExclusion";
export type PendingExclusionUndo = {
  userId: string;
  request: Extract<TrainingExclusionRequest, { actionId: "restore-pair" | "restore-headword" }>;
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

const restoredListeners = new Set<(userId:string,exclusionId:string)=>void>();
export function subscribeRestoredExclusion(listener:(userId:string,exclusionId:string)=>void) {
  restoredListeners.add(listener);
  return ()=>{restoredListeners.delete(listener);};
}
/** Only an accepted server restore can reset a still-open Library action. */
export function completeExclusionUndo(value:PendingExclusionUndo) {
  restoredListeners.forEach(listener=>listener(value.userId,value.request.exclusionId));
  if (pending === value) rememberExclusionUndo(null);
}
