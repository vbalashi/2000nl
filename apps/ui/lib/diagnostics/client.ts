import { acceptsDiagnostic, disabledDiagnosticPolicy, type DiagnosticPolicy } from "./policy";
import { readDiagnosticPolicy } from "./policyClient";
import type { TrainingDiagnostic } from "./contract";
type Timing = {
  transitionId: string;
  stage: string;
  outcome: string;
  requestId?: string;
};
type Pending = {
  elapsed: number;
  at: number;
  eligible: boolean;
  stalled: boolean;
  operation: "transition" | "display";
  requestId?: string;
};
export const TRAINING_STALL_MS = 10_000;
export class ForegroundLoadTracker {
  private pending = new Map<string, Pending>();
  constructor(
    private emit: (event: Omit<TrainingDiagnostic, "eventId">) => void,
    private now = () => performance.now(),
    private eligible = () =>
      document.visibilityState === "visible" && navigator.onLine,
  ) {}
  start(
    transitionId: string,
    operation: "transition" | "display" = "transition",
  ) {
    if (this.pending.has(transitionId)) return;
    if (this.pending.size >= 128)
      this.finish(this.pending.keys().next().value!, "cancelled");
    this.pending.set(transitionId, {
      elapsed: 0,
      at: this.now(),
      eligible: this.eligible(),
      stalled: false,
      operation,
    });
    this.emitEvent(transitionId, "load_started");
  }
  link(transitionId: string, requestId: string) {
    const p = this.pending.get(transitionId);
    if (p) p.requestId = requestId;
  }
  tick() {
    const now = this.now();
    for (const [id, p] of this.pending) {
      if (p.eligible) p.elapsed += Math.max(0, now - p.at);
      p.at = now;
      p.eligible = this.eligible();
      if (!p.stalled && p.eligible && p.elapsed >= TRAINING_STALL_MS) {
        p.stalled = true;
        this.emitEvent(id, "load_stalled");
      }
      if (p.elapsed >= 600_000) this.finish(id, "cancelled");
    }
  }
  finish(id: string, result: "ready" | "failed" | "cancelled") {
    const p = this.pending.get(id);
    if (!p) return;
    if (p.eligible) p.elapsed += Math.max(0, this.now() - p.at);
    this.emitEvent(id, `load_${result}`);
    this.pending.delete(id);
  }
  clear() {
    for (const id of this.pending.keys()) this.finish(id, "cancelled");
  }
  private emitEvent(transitionId: string, kind: TrainingDiagnostic["kind"]) {
    const p = this.pending.get(transitionId)!;
    this.emit({
      kind,
      operation: p.operation,
      transitionId,
      ...(p.requestId ? { requestId: p.requestId } : {}),
      durationMs: Math.round(Math.min(p.elapsed, 86_400_000)),
      foreground: document.visibilityState === "visible",
      online: navigator.onLine,
    });
  }
}
type Session = {
  queue: TrainingDiagnostic[];
  policy: DiagnosticPolicy;
  stopped: boolean;
  flushing: boolean;
  tracker: ForegroundLoadTracker;
  headers: () => Promise<HeadersInit>;
};
let session: Session | undefined;
const displayedLoads = new Set<string>();
export function currentDisplayedLoadId() {
  return Array.from(displayedLoads).at(-1);
}
function enqueue(event: Omit<TrainingDiagnostic, "eventId">) {
  if (!session || session.stopped) return;
  if (session.queue.length >= 100) session.queue.shift();
  const diagnostic = { eventId: crypto.randomUUID(), ...event };
  if (!acceptsDiagnostic(session.policy,diagnostic)) return;
  session.queue.push(diagnostic);
  if (["load_stalled", "load_failed", "request_failed"].includes(event.kind))
    void flush(session);
}
/** Mounted signed-in training only; no durable browser storage, content or account ids. */
export function startTrainingDiagnostics(
  _owner: string,
  headers: () => Promise<HeadersInit>,
) {
  session?.tracker.clear();
  if (session) session.stopped = true;
  const current: Session = {
    headers,
    policy: disabledDiagnosticPolicy(),
    queue: [],
    stopped: false,
    flushing: false,
    tracker: new ForegroundLoadTracker(enqueue),
  };
  session = current;
  for (const id of displayedLoads) current.tracker.start(id, "display");
  let policyRequest: AbortController | undefined;
  const refreshPolicy = async () => {
    if (policyRequest || current.stopped) return;
    const request=new AbortController(); policyRequest=request;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const policy=await Promise.race([
        readDiagnosticPolicy(current.headers,request.signal),
        new Promise<never>((_,reject)=>{timer=setTimeout(()=>{request.abort();reject(new Error("diagnostics_policy_timeout"));},3000);}),
      ]);
      if(!current.stopped&&!request.signal.aborted&&session===current) current.policy=policy;
    } catch {current.policy=disabledDiagnosticPolicy();}
    finally {clearTimeout(timer);policyRequest=undefined;}
  };
  void refreshPolicy();
  const policyTimer=window.setInterval(()=>{void refreshPolicy();},30_000);
  const tick = () => current.tracker.tick();
  const timer = window.setInterval(tick, 1_000);
  const flushTimer = window.setInterval(() => {
    void flush(current);
  }, 5_000);
  document.addEventListener("visibilitychange", tick);
  window.addEventListener("online", tick);
  window.addEventListener("offline", tick);
  return () => {
    current.tracker.clear();
    current.stopped = true;
    policyRequest?.abort();
    window.clearInterval(policyTimer);
    current.queue = [];
    if (session === current) session = undefined;
    window.clearInterval(timer);
    window.clearInterval(flushTimer);
    document.removeEventListener("visibilitychange", tick);
    window.removeEventListener("online", tick);
    window.removeEventListener("offline", tick);
  };
}
async function flush(current: Session) {
  if (!current.policy.enabled || current.policy.validUntil<=Date.now()) {
    current.queue=[];
    return;
  }
  if (
    current.stopped ||
    current.flushing ||
    !current.queue.length ||
    !navigator.onLine
  )
    return;
  current.flushing = true;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 3_000);
  try {
    const auth = await Promise.race([
      current.headers(),
      new Promise<never>((_, reject) =>
        controller.signal.addEventListener(
          "abort",
          () => reject(new Error("diagnostics_timeout")),
          { once: true },
        ),
      ),
    ]);
    if (current.stopped || session !== current || controller.signal.aborted)
      return;
    const batch = current.queue.splice(0, 20).filter(event=>acceptsDiagnostic(current.policy,event));
    if(!batch.length)return;
    await fetch("/api/diagnostics/training", {
      method: "POST",
      credentials: "same-origin",
      headers: auth,
      body: JSON.stringify(batch),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch {
    /* Best effort: never block training or retry ambiguous delivery. */
  } finally {
    window.clearTimeout(timer);
    current.flushing = false;
  }
}
export function observeTrainingTiming(timing: Timing) {
  const tracker = session?.tracker;
  if (!tracker) return;
  if (timing.stage === "transition.start") tracker.start(timing.transitionId);
  if (timing.requestId) tracker.link(timing.transitionId, timing.requestId);
  if (timing.stage === "transition.total")
    tracker.finish(
      timing.transitionId,
      /cancelled|skipped/.test(timing.outcome)
        ? "cancelled"
        : /error|failed|not-ready/.test(timing.outcome)
          ? "failed"
          : "ready",
    );
}
export function linkTrainingRequest(
  transitionId: string | undefined,
  requestId: string,
) {
  if (transitionId) session?.tracker.link(transitionId, requestId);
}
export function observeTrainingRequest(event: {
  requestId: string;
  displayId?: string;
  transitionId?: string;
  status?: number;
  durationMs: number;
  result: "ready" | "failed" | "cancelled";
}) {
  if (event.transitionId)
    session?.tracker.link(event.transitionId, event.requestId);
  if (event.displayId) session?.tracker.link(event.displayId, event.requestId);
  enqueue({
    kind: `request_${event.result}`,
    operation: "request",
    requestId: event.requestId,
    ...(event.displayId ? { displayId: event.displayId } : {}),
    ...(event.transitionId ? { transitionId: event.transitionId } : {}),
    ...(event.status ? { status: event.status } : {}),
    durationMs: Math.round(Math.min(event.durationMs, 86_400_000)),
    foreground: document.visibilityState === "visible",
    online: navigator.onLine,
  });
}

export function beginDisplayedCardLoad(id: string) {
  if (displayedLoads.size >= 16)
    displayedLoads.delete(displayedLoads.values().next().value!);
  displayedLoads.add(id);
  session?.tracker.start(id, "display");
}
export function endDisplayedCardLoad(
  id: string,
  result: "ready" | "failed" | "cancelled",
) {
  displayedLoads.delete(id);
  session?.tracker.finish(id, result);
}
