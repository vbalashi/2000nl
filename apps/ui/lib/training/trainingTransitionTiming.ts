export type TrainingTransitionStage =
  | "auth.session"
  | "training.preferences"
  | "training.active-scope-hydration"
  | "training.scenarios"
  | "next-card.selection"
  | "next-card.prefetch"
  | "next-card.preparation"
  | "review.mutation"
  | "review.mutation.request"
  | "review.reconciliation.request"
  | "next-card.lookup"
  | "translation.cache"
  | "translation.provider"
  | "translation.unknown"
  | "audio.cache"
  | "audio.provider"
  | "network.transfer"
  | "card.render"
  | "preparation.total"
  | "transition.start"
  | "transition.total";

export type TrainingTransitionTiming = {
  transitionId: string;
  stage: TrainingTransitionStage;
  durationMs: number;
  outcome: string;
  requestId?: string;
  serverTiming?: string;
  monotonicStartedAtMs?: number;
  monotonicEndedAtMs?: number;
};

export type RecordedTrainingTransitionTiming = TrainingTransitionTiming & {
  recordedAtMs: number;
  monotonicStartedAtMs: number;
  monotonicEndedAtMs: number;
};

const MAX_TRANSITION_ID_LENGTH = 128;
const MAX_OUTCOME_LENGTH = 64;
const MAX_REQUEST_ID_LENGTH = 128;
const MAX_SERVER_TIMING_METRICS = 16;
const SERVER_TIMING_METRIC = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

const preparedEntryTransitions = new Map<
  string,
  { transitionId: string; renderStartedAt: number | null }
>();
type TrainingUserTransitionAction = "continue" | "learn" | "review" | "retry";
const activeUserTransitions = new Map<
  string,
  { startedAt: number; action: TrainingUserTransitionAction }
>();
const MAX_ACTIVE_USER_TRANSITIONS = 128;
let transitionSequence = 0;

export function createTrainingTransitionId() {
  transitionSequence += 1;
  return `training-${Date.now().toString(36)}-${transitionSequence.toString(36)}`;
}

export function beginTrainingUserTransition(
  transitionId: string,
  action: TrainingUserTransitionAction,
) {
  const startedAt = performance.now();
  activeUserTransitions.set(transitionId, {
    startedAt,
    action,
  });
  recordTrainingTransitionTiming({
    transitionId,
    stage: "transition.start",
    durationMs: 0,
    outcome: action,
    monotonicStartedAtMs: startedAt,
    monotonicEndedAtMs: startedAt,
  });
  while (activeUserTransitions.size > MAX_ACTIVE_USER_TRANSITIONS) {
    const oldest = activeUserTransitions.keys().next().value;
    if (typeof oldest !== "string") break;
    activeUserTransitions.delete(oldest);
  }
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
  const renderedAt = performance.now();
  recordTrainingTransitionTiming({
    transitionId: transition.transitionId,
    stage: "card.render",
    durationMs: renderedAt - transition.renderStartedAt,
    outcome: "ready",
    monotonicStartedAtMs: transition.renderStartedAt,
    monotonicEndedAtMs: renderedAt,
  });
  finishTrainingUserTransition(transition.transitionId, "ready", renderedAt);
}

export function recordTrainingEntryTerminalFailure(
  entryId: string,
  failure: string,
) {
  const transition = preparedEntryTransitions.get(entryId);
  if (!transition) return false;
  preparedEntryTransitions.delete(entryId);
  return finishTrainingUserTransition(
    transition.transitionId,
    `error-${failure}`,
  );
}

export function finishTrainingUserTransition(
  transitionId: string,
  outcome: string,
  endedAt = performance.now(),
) {
  const userTransition = activeUserTransitions.get(transitionId);
  if (!userTransition) return false;
  activeUserTransitions.delete(transitionId);
  recordTrainingTransitionTiming({
    transitionId,
    stage: "transition.total",
    durationMs: endedAt - userTransition.startedAt,
    outcome: `${userTransition.action}-${outcome}`,
    monotonicStartedAtMs: userTransition.startedAt,
    monotonicEndedAtMs: endedAt,
  });
  return true;
}

export function recordTrainingTransitionTiming(
  timing: TrainingTransitionTiming,
) {
  const interval = normalizedMonotonicInterval(timing);
  const requestId = safeRequestId(timing.requestId);
  const serverTiming = sanitizeServerTiming(timing.serverTiming);
  const event: RecordedTrainingTransitionTiming = {
    transitionId: boundedToken(
      timing.transitionId,
      MAX_TRANSITION_ID_LENGTH,
      "training-unknown",
    ),
    stage: timing.stage,
    durationMs: roundedDuration(timing.durationMs),
    outcome: boundedOutcome(timing.outcome),
    recordedAtMs: Date.now(),
    ...interval,
    ...(requestId ? { requestId } : {}),
    ...(serverTiming ? { serverTiming } : {}),
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
    const endedAt = performance.now();
    recordTrainingTransitionTiming({
      transitionId,
      stage,
      durationMs: endedAt - startedAt,
      outcome: outcome(result),
      monotonicStartedAtMs: startedAt,
      monotonicEndedAtMs: endedAt,
    });
    return result;
  } catch (error) {
    const endedAt = performance.now();
    recordTrainingTransitionTiming({
      transitionId,
      stage,
      durationMs: endedAt - startedAt,
      outcome: "failed",
      monotonicStartedAtMs: startedAt,
      monotonicEndedAtMs: endedAt,
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
  const endedAt = performance.now();
  const durationMs = endedAt - startedAt;
  const serverTiming = sanitizeServerTiming(
    response.headers.get("server-timing") ?? undefined,
  );
  const requestId = response.headers.get("x-request-id") ?? undefined;
  recordTrainingTransitionTiming({
    transitionId,
    stage,
    durationMs,
    outcome,
    requestId,
    serverTiming,
    monotonicStartedAtMs: startedAt,
    monotonicEndedAtMs: endedAt,
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
      monotonicStartedAtMs: startedAt + Number(serverTotal),
      monotonicEndedAtMs: endedAt,
    });
  }
}

function normalizedMonotonicInterval(timing: TrainingTransitionTiming) {
  const durationMs = roundedDuration(timing.durationMs);
  const suppliedEnd = timing.monotonicEndedAtMs;
  const endedAt = roundedMonotonicTime(
    Number.isFinite(suppliedEnd) ? suppliedEnd : performance.now(),
  );
  const suppliedStart = timing.monotonicStartedAtMs;
  const startedAt = Math.min(
    endedAt,
    roundedMonotonicTime(
      Number.isFinite(suppliedStart) ? suppliedStart : endedAt - durationMs,
    ),
  );
  return {
    monotonicStartedAtMs: startedAt,
    monotonicEndedAtMs: endedAt,
  };
}

function roundedMonotonicTime(value: number | undefined) {
  if (!Number.isFinite(value)) return 0;
  return Number(Math.max(0, value ?? 0).toFixed(1));
}

function roundedDuration(durationMs: number) {
  if (!Number.isFinite(durationMs)) return 0;
  return Number(Math.max(0, durationMs).toFixed(1));
}

function boundedToken(value: string, maxLength: number, fallback: string) {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const normalized = trimmed.replace(/[^A-Za-z0-9._:-]/g, "-");
  return normalized.slice(0, maxLength) || fallback;
}

function boundedOutcome(value: string) {
  return boundedToken(value, MAX_OUTCOME_LENGTH, "unknown");
}

function safeRequestId(value: string | undefined) {
  const trimmed = value?.trim();
  if (
    !trimmed ||
    trimmed.length > MAX_REQUEST_ID_LENGTH ||
    !SAFE_TOKEN.test(trimmed)
  ) {
    return undefined;
  }
  return trimmed;
}

function sanitizeServerTiming(value: string | undefined) {
  if (!value) return undefined;
  const metrics: string[] = [];
  for (const rawMetric of value.split(",")) {
    if (metrics.length >= MAX_SERVER_TIMING_METRICS) break;
    const parts = rawMetric.split(";").map((part) => part.trim());
    const name = parts[0];
    if (!name || !SERVER_TIMING_METRIC.test(name)) continue;
    const durationPart = parts.find((part) => part.startsWith("dur="));
    const duration = durationPart
      ? Number(durationPart.slice("dur=".length))
      : Number.NaN;
    if (!Number.isFinite(duration) || duration < 0) continue;
    metrics.push(`${name};dur=${roundedDuration(duration)}`);
  }
  return metrics.length ? metrics.join(", ") : undefined;
}
