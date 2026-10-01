export type ActiveStudyCardIdentity = {
  ownerId: string;
  sessionId: string;
  family: "meaning" | "idiom" | "sentence";
  cardKey: string;
  target?: { entryId: string; cardTypeId: string | null; targetId: string | null };
};

export type ActiveStudyDuration = ActiveStudyCardIdentity & { activeMilliseconds: number };

/**
 * Measures attention on a rendered card, independently of FSRS/review actions.
 * The caller owns card readiness, overlays, visibility and persistence.
 */
export const ACTIVE_STUDY_SAMPLE_MS = 15_000;
export const ACTIVE_STUDY_MAX_SAMPLE_GAP_MS = 30_000;

export class ActiveStudyClock {
  private lastSample: number | null = null;
  private running = false;
  private pendingMs = 0;

  /** Settle the old state first so pausing never discards its final interval. */
  setRunning(running: boolean, now: number): void {
    this.sample(now);
    this.running = running;
  }

  sample(now: number): void {
    if (!Number.isFinite(now) || now < 0) return;
    if (this.lastSample !== null && now < this.lastSample) return;
    if (this.lastSample !== null && this.running) {
      const elapsed = now - this.lastSample;
      // A suspended browser/OS can miss visibility events. Such an unobserved
      // gap is unknown time, not evidence of uninterrupted study.
      if (elapsed <= ACTIVE_STUDY_MAX_SAMPLE_GAP_MS) this.pendingMs += elapsed;
    }
    this.lastSample = now;
  }

  /** Milliseconds remain precise until persistence, rather than rounding minutes. */
  takeMilliseconds(now: number): number {
    this.sample(now);
    const wholeMs = Math.floor(this.pendingMs);
    this.pendingMs -= wholeMs;
    return wholeMs;
  }
}
