import { supabase } from "@/lib/supabaseClient";
import { authenticatedAccountRequest } from "@/lib/preferences/accountRequest";
import { parseStudyTimeMeasurement, type StudyTimeMeasurement } from "./model";
import type { ActiveStudyDuration } from "../activeStudyClock";

type Pending = { value: StudyTimeMeasurement; attempts: number };
type Dependencies = { principal: () => Promise<string | null>; send: (value: StudyTimeMeasurement) => Promise<"accepted" | "rejected" | "retry">; schedule: (callback: () => void, ms: number) => void };
/** Bounded best-effort attention delivery, independent of card actions and retries. */
export class StudyTimeDelivery {
  private pending: Pending[] = [];
  private busy = false;
  constructor(private ownerId: string, private dependencies: Dependencies) {}
  enqueue(value: StudyTimeMeasurement): void {
    if (this.pending.length >= 64) return;
    this.pending.push({ value: { ...value }, attempts: 0 });
    void this.drain();
  }
  private async drain(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.pending.length) {
        if (await this.dependencies.principal() !== this.ownerId) { this.pending = []; return; }
        const item = this.pending[0];
        const outcome = await this.dependencies.send(item.value).catch(() => "retry" as const);
        if (outcome !== "retry" || ++item.attempts >= 3) { this.pending.shift(); continue; }
        this.dependencies.schedule(() => { this.busy = false; void this.drain(); }, item.attempts * 1000);
        return;
      }
    } catch { this.pending = []; }
    finally { if (!this.pending.length) this.busy = false; }
  }
}
const deliveries = new Map<string, StudyTimeDelivery>();
export function deliverStudyTime(duration: ActiveStudyDuration): void {
  if (!duration.target) return;
  const value = parseStudyTimeMeasurement({ measurementId: crypto.randomUUID(), sessionId: duration.sessionId, family: duration.family,
    ...duration.target, activeMilliseconds: duration.activeMilliseconds, observedAt: new Date().toISOString() });
  if (!value) return;
  let delivery = deliveries.get(duration.ownerId);
  if (!delivery) {
    // Retain only a bounded set of account queues; each rechecks the live principal.
    if (deliveries.size >= 4) deliveries.delete(deliveries.keys().next().value!);
    delivery = new StudyTimeDelivery(duration.ownerId, {
      principal: async () => (await supabase.auth.getSession()).data.session?.user.id ?? null,
      schedule: (callback, ms) => { window.setTimeout(callback, ms); },
      send: async measurement => {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 8000);
        try {
          const response = await authenticatedAccountRequest("/api/training/study-time", duration.ownerId, {
            method: "POST", credentials: "same-origin", keepalive: true,
            body: JSON.stringify(measurement), signal: controller.signal });
          if (!response.ok) return response.status >= 500 || response.status === 429 ? "retry" : "rejected";
          const body = await response.json();
          return body?.accepted === true && typeof body.duplicate === "boolean" ? "accepted" : "rejected";
        } finally { window.clearTimeout(timeout); }
      },
    });
    deliveries.set(duration.ownerId, delivery);
  }
  delivery.enqueue(value);
}
