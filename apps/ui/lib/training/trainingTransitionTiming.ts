export type TrainingTransitionStage =
  | "next-card.selection"
  | "review.mutation"
  | "next-card.lookup"
  | "translation.cache"
  | "translation.provider"
  | "translation.unknown"
  | "audio.cache"
  | "audio.provider"
  | "network.transfer"
  | "card.render"
  | "preparation.total";

export type TrainingTransitionTiming = {
  transitionId: string;
  stage: TrainingTransitionStage;
  durationMs: number;
  outcome: string;
  requestId?: string;
  serverTiming?: string;
};

const preparedEntryTransitions = new Map<
  string,
  { transitionId: string; renderStartedAt: number | null }
>();
let transitionSequence = 0;

export function createTrainingTransitionId() {
  transitionSequence += 1;
  return `training-${Date.now().toString(36)}-${transitionSequence.toString(36)}`;
}

export function registerTrainingEntryTransition(
  entryId: string,
  transitionId: string,
) {
  preparedEntryTransitions.set(entryId, {
    transitionId,
    renderStartedAt: null,
  });
}

export function markTrainingEntryPresentationStarted(entryId: string) {
  const transition = preparedEntryTransitions.get(entryId);
  if (!transition) return;
  transition.renderStartedAt = performance.now();
}

export function recordTrainingEntryRendered(entryId: string) {
  const transition = preparedEntryTransitions.get(entryId);
  if (!transition || transition.renderStartedAt === null) return;
  preparedEntryTransitions.delete(entryId);
  recordTrainingTransitionTiming({
    transitionId: transition.transitionId,
    stage: "card.render",
    durationMs: performance.now() - transition.renderStartedAt,
    outcome: "ready",
  });
}

export function recordTrainingTransitionTiming(
  timing: TrainingTransitionTiming,
) {
  const event = {
    ...timing,
    durationMs: Number(Math.max(0, timing.durationMs).toFixed(1)),
  };
  if (process.env.NODE_ENV !== "test") {
    console.info("[platform.training.transition]", event);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("2000nl:training-transition-timing", { detail: event }),
    );
  }
  return event;
}

export async function measureTrainingTransitionStage<T>(
  transitionId: string,
  stage: TrainingTransitionStage,
  operation: () => Promise<T>,
  outcome: (result: T) => string = () => "ready",
): Promise<T> {
  const startedAt = performance.now();
  try {
    const result = await operation();
    recordTrainingTransitionTiming({
      transitionId,
      stage,
      durationMs: performance.now() - startedAt,
      outcome: outcome(result),
    });
    return result;
  } catch (error) {
    recordTrainingTransitionTiming({
      transitionId,
      stage,
      durationMs: performance.now() - startedAt,
      outcome: "failed",
    });
    throw error;
  }
}

export function recordTrainingTransitionResponse(
  transitionId: string,
  stage: TrainingTransitionStage,
  startedAt: number,
  response: Response,
  outcome: string,
) {
  const durationMs = performance.now() - startedAt;
  const serverTiming = response.headers.get("server-timing") ?? undefined;
  const requestId = response.headers.get("x-request-id") ?? undefined;
  recordTrainingTransitionTiming({
    transitionId,
    stage,
    durationMs,
    outcome,
    requestId,
    serverTiming,
  });
  const serverTotal = serverTiming
    ?.split(",")
    .map((value) => value.trim())
    .find((value) => value.startsWith("route.total;"))
    ?.match(/dur=([0-9.]+)/)?.[1];
  if (serverTotal) {
    recordTrainingTransitionTiming({
      transitionId,
      stage: "network.transfer",
      durationMs: Math.max(0, durationMs - Number(serverTotal)),
      outcome: stage,
      requestId,
    });
  }
}
