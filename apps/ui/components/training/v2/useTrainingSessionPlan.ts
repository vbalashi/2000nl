"use client";

import React from "react";
import {
  createTrainingSessionPlanKey,
  fetchTrainingSessionPlan,
  type TrainingSessionPlanScope,
} from "@/lib/trainingService";
import type { TrainingMode, TrainingSessionPlan } from "@/lib/types";

export type TrainingSessionPlanSnapshot = {
  sessionGeneration: number;
  scopeKey: string;
  plan: TrainingSessionPlan;
};

export function useTrainingSessionPlan({
  active,
  sessionGeneration,
  scopeKey,
  fetchPlan,
}: {
  active: boolean;
  sessionGeneration: number;
  scopeKey: string;
  fetchPlan: () => Promise<TrainingSessionPlan | null>;
}) {
  const [snapshot, setSnapshot] =
    React.useState<TrainingSessionPlanSnapshot | null>(null);
  const requestGenerationRef = React.useRef(0);

  React.useEffect(() => {
    const requestGeneration = (requestGenerationRef.current += 1);
    if (!active) return;

    void fetchPlan().then((plan) => {
      if (requestGenerationRef.current !== requestGeneration || !plan) return;
      setSnapshot({ sessionGeneration, scopeKey, plan });
    });
  }, [active, fetchPlan, scopeKey, sessionGeneration]);

  const currentSnapshot =
    active &&
    snapshot?.sessionGeneration === sessionGeneration &&
    snapshot.scopeKey === scopeKey
      ? snapshot
      : null;

  return { snapshot: currentSnapshot };
}

export function useAuthoritativeTrainingSessionPlan({
  active,
  sessionGeneration,
  userId,
  modes,
  scope,
}: {
  active: boolean;
  sessionGeneration: number;
  userId: string;
  modes: TrainingMode[];
  scope: TrainingSessionPlanScope;
}) {
  const scopeKey = React.useMemo(
    () => createTrainingSessionPlanKey(userId, modes, scope),
    [modes, scope, userId],
  );
  const fetchPlan = React.useCallback(
    () => fetchTrainingSessionPlan(userId, modes, scope),
    [modes, scope, userId],
  );
  const { snapshot } = useTrainingSessionPlan({
    active,
    sessionGeneration,
    scopeKey,
    fetchPlan,
  });
  return { scopeKey, snapshot };
}
