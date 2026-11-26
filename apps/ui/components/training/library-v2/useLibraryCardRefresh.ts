import { useCallback, useLayoutEffect, useRef } from "react";

export type LibraryRefreshHint = {
  changed?: boolean;
  memberships?: boolean;
  translation?: boolean;
};

const PERIODIC_INTERVAL_MS = 60_000;
const INITIAL_BACKOFF_MS = 120_000;
const MAX_BACKOFF_MS = 900_000;

/** One queue per open article. Periodic hints can be dropped; changes during a read need a new read. */
export function useLibraryCardRefresh(
  identity: string,
  read: (hint: LibraryRefreshHint, signal: AbortSignal) => Promise<boolean | null>,
) {
  const latestRead = useRef(read);
  latestRead.current = read;
  const queue = useRef<{ identity: string; enqueue: (hint: LibraryRefreshHint) => Promise<void> }>();

  useLayoutEffect(() => {
    const lifetime = new AbortController();
    let queued: LibraryRefreshHint | undefined;
    let deferred: LibraryRefreshHint | undefined;
    const merge = (first: LibraryRefreshHint | undefined, second: LibraryRefreshHint) => ({
      changed: first?.changed || second.changed,
      memberships: first?.memberships || second.memberships,
      translation: first?.translation || second.translation,
    });
    let running: Promise<void> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastAttempt = -Infinity;
    let retryAt = -Infinity;
    let backoff = INITIAL_BACKOFF_MS;

    const drain = (): Promise<void> => {
      if (lifetime.signal.aborted || !queued) return Promise.resolve();
      if (running) return running;
      const delay = retryAt - Date.now();
      if (delay > 0) {
        timer ??= setTimeout(() => { timer = undefined; void drain(); }, delay);
        return Promise.resolve();
      }

      const hint = merge(deferred, queued);
      queued = undefined;
      deferred = undefined;
      lastAttempt = Date.now();
      running = latestRead.current(hint, lifetime.signal).then(result => {
        if (lifetime.signal.aborted || result === null) return;
        if (result) {
          retryAt = -Infinity;
          backoff = INITIAL_BACKOFF_MS;
        } else {
          retryAt = Date.now() + backoff;
          backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
        }
      }).finally(() => {
        running = undefined;
        void drain();
      });
      return running;
    };

    const enqueue = (hint: LibraryRefreshHint) => {
      const now = Date.now();
      if (!hint.changed && (now < retryAt || (now - lastAttempt < PERIODIC_INTERVAL_MS))) {
        deferred = merge(deferred, hint);
        return Promise.resolve();
      }
      queued = merge(queued, hint);
      return Promise.resolve().then(drain);
    };
    queue.current = { identity, enqueue };
    return () => {
      queue.current = undefined;
      lifetime.abort();
      clearTimeout(timer);
    };
  }, [identity]);

  return useCallback((hint: LibraryRefreshHint) => {
    const current = queue.current;
    return current?.identity === identity ? current.enqueue(hint) : Promise.resolve();
  }, [identity]);
}
