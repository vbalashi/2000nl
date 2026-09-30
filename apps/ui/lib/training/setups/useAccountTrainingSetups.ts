"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAccountTrainingSetups, saveAccountTrainingSetups } from "./client";
import { emptyTrainingSetups, parseTrainingSetupsDocument, type SavedTraining, type TrainingSetupsDocument, type TrainingSetupsSnapshot } from "./model";
export type TrainingSetupsMutationResult = "saved" | "conflict" | "error" | "unavailable";
type State = { userId: string | undefined; status: "idle" | "loading" | "ready" | "error"; snapshot: TrainingSetupsSnapshot };

export function useAccountTrainingSetups(userId?: string) {
  const [state, setState] = useState<State>({ userId: undefined, status: "idle", snapshot: emptyTrainingSetups() });
  const [pending, setPending] = useState(false);
  const stateRef = useRef(state);
  const ownerRef = useRef(userId);
  const mutationRef = useRef(false);
  const readGeneration = useRef(0);
  const invalidateReads = useCallback(() => ++readGeneration.current, []);
  stateRef.current = state;
  ownerRef.current = userId;
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!userId || mutationRef.current) return;
    const generation = invalidateReads();
    setState(previous => ({ userId, status: "loading", snapshot: previous.userId === userId ? previous.snapshot : emptyTrainingSetups() }));
    try {
      const snapshot = await fetchAccountTrainingSetups(userId, signal);
      if (!signal?.aborted && ownerRef.current === userId && generation === readGeneration.current) {
        setState({ userId, status: "ready", snapshot });
      }
    } catch {
      if (!signal?.aborted && ownerRef.current === userId && generation === readGeneration.current) {
        setState(previous => ({ ...previous, userId, status: "error" }));
      }
    }
  }, [userId, invalidateReads]);
  useEffect(() => {
    const controller = new AbortController();
    // Invalidate reads and mutations belonging to the previous signed-in account.
    invalidateReads();
    mutationRef.current = false;
    setPending(false);
    setState({ userId, status: userId ? "loading" : "idle", snapshot: emptyTrainingSetups() });
    void load(controller.signal);
    return () => { controller.abort(); invalidateReads(); };
  }, [userId, load, invalidateReads]);
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  const mutate = useCallback(async (change: (document: TrainingSetupsDocument) => TrainingSetupsDocument | null): Promise<TrainingSetupsMutationResult> => {
    const current = stateRef.current;
    if (!userId || current.userId !== userId || current.status !== "ready" || mutationRef.current) return "unavailable";
    const next = change(current.snapshot.document);
    if (!next) return "conflict";
    const document = parseTrainingSetupsDocument(next);
    if (!document) return "error";
    mutationRef.current = true;
    setPending(true);
    // Any earlier focus read must not replace the accepted write response.
    const generation = invalidateReads();
    try {
      const result = await saveAccountTrainingSetups(userId, current.snapshot.revision, document);
      if (ownerRef.current !== userId || generation !== readGeneration.current) return "unavailable";
      if (result.kind !== "error") {
        const nextState: State = { userId, status: "ready", snapshot: result.snapshot };
        stateRef.current = nextState;
        setState(nextState);
      }
      return result.kind;
    } finally {
      if (ownerRef.current === userId && generation === readGeneration.current) {
        mutationRef.current = false;
        setPending(false);
      }
    }
  }, [userId, invalidateReads]);
  const save = useCallback((training: SavedTraining, create: boolean) => mutate(document => {
    const exists = document.trainings.some(item => item.id === training.id);
    if (create === exists) return null; // Never resurrect a concurrently deleted setup.
    return { ...document, trainings: create ? [training, ...document.trainings] : document.trainings.map(item => item.id === training.id ? training : item), mainTrainingId: document.mainTrainingId ?? training.id };
  }), [mutate]);
  const makeMain = useCallback((id: string) => mutate(document => document.trainings.some(item => item.id === id) ? { ...document, mainTrainingId: id } : null), [mutate]);
  const remove = useCallback((id: string) => mutate(document => {
    if (!document.trainings.some(item => item.id === id)) return null;
    const trainings = document.trainings.filter(item => item.id !== id);
    return { ...document, trainings, mainTrainingId: document.mainTrainingId === id ? trainings[0]?.id ?? null : document.mainTrainingId };
  }), [mutate]);
  const owned = state.userId === userId;
  return {
    status: owned ? state.status : userId ? "loading" as const : "idle" as const,
    snapshot: owned ? state.snapshot : emptyTrainingSetups(),
    pending: owned && pending,
    reload: load, save, makeMain, remove,
  };
}
