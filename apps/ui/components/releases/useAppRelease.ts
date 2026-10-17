"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { appVersionInfo } from "@/lib/appVersion";
import {
  buildIdentity,
  parseAppRelease,
  releaseUpdateUrl,
  RELEASE_MARKER,
  type AppRelease,
} from "@/lib/releases/appRelease";

export type ReleaseStatus =
  | "checking"
  | "ready"
  | "unknown"
  | "updating"
  | "failed"
  | "worker"
  | "updated";
const installed = appVersionInfo();
const installedId = buildIdentity(installed);
function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* In-memory state still works. */
  }
}

export function useAppRelease(ownerId: string, unsafe: boolean) {
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [status, setStatus] = useState<ReleaseStatus>("checking");
  const [seen, setSeen] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const namespace = `2000nl:releases:${ownerId}`;
  const unsafeRef = useRef(unsafe);
  unsafeRef.current = unsafe;
  const request = useRef<Promise<AppRelease | null> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const lastAttempt = useRef(0);
  const failures = useRef(0);
  const mounted = useRef(false);
  const updating = useRef(false);
  const [storageReady, setStorageReady] = useState(false);
  useEffect(() => {
    mounted.current = true;
    setSeen(read(`${namespace}:seen`));
    setDismissed(read(`${namespace}:dismissed`));
    setStorageReady(true);
    const changed = (e: StorageEvent) => {
      if (e.key === `${namespace}:seen`) setSeen(e.newValue);
      if (e.key === `${namespace}:dismissed`) setDismissed(e.newValue);
    };
    window.addEventListener("storage", changed);
    return () => {
      mounted.current = false;
      controller.current?.abort();
      request.current = null;
      window.removeEventListener("storage", changed);
    };
  }, [namespace]);
  const check = useCallback((manual = false): Promise<AppRelease | null> => {
    if (request.current) return request.current;
    if (!manual && Date.now() - lastAttempt.current < 60_000)
      return Promise.resolve(null);
    lastAttempt.current = Date.now();
    if (manual && !updating.current) setStatus("checking");
    const abort = new AbortController();
    controller.current = abort;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, 5000);
    const task = (async () => {
      try {
        const response = await fetch("/api/app-release", {
          cache: "no-store",
          signal: abort.signal,
        });
        if (!response.ok) throw new Error("Release check failed");
        const next = parseAppRelease(await response.json());
        if (!mounted.current || abort.signal.aborted) return null;
        failures.current = 0;
        setRelease(next);
        const marker = new URL(window.location.href).searchParams.get(
          RELEASE_MARKER,
        );
        const liveId = buildIdentity(next.build);
        // A reload is successful only when the new document matches the live server.
        if (marker && installedId && installedId === liveId) {
          const clean = new URL(window.location.href);
          clean.searchParams.delete(RELEASE_MARKER);
          window.history.replaceState(window.history.state, "", clean.href);
          if (!updating.current) setStatus("updated");
        } else if (!updating.current)
          setStatus(!liveId ? "unknown" : marker ? "failed" : "ready");
        return next;
      } catch {
        if (mounted.current && (!abort.signal.aborted || timedOut)) {
          failures.current++;
          if (!updating.current) setStatus("unknown");
        }
        return null;
      } finally {
        window.clearTimeout(timeout);
        if (controller.current === abort) request.current = null;
      }
    })();
    request.current = task;
    return task;
  }, []);
  useEffect(() => {
    void check(true);
    const focused = () => {
      if (document.visibilityState !== "hidden") void check();
    };
    const online = () => {
      void check(true);
    };
    window.addEventListener("focus", focused);
    document.addEventListener("visibilitychange", focused);
    window.addEventListener("online", online);
    let timer: number;
    const tick = () => {
      timer = window.setTimeout(
        () => {
          if (document.visibilityState !== "hidden") void check();
          tick();
        },
        Math.min(900_000, 300_000 * 2 ** Math.min(failures.current, 2)) +
          Math.random() * 15_000,
      );
    };
    tick();
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", focused);
      document.removeEventListener("visibilitychange", focused);
      window.removeEventListener("online", online);
    };
  }, [check]);
  const targetId = release && buildIdentity(release.build);
  const updateAvailable = Boolean(
    installedId && targetId && installedId !== targetId,
  );
  const unread = Boolean(
    release?.announcement && seen !== release.announcement.id && storageReady,
  );
  const markRead = useCallback(() => {
    if (release?.announcement) {
      setSeen(release.announcement.id);
      write(`${namespace}:seen`, release.announcement.id);
    }
  }, [namespace, release]);
  const dismiss = () => {
    if (targetId) {
      setDismissed(targetId);
      write(`${namespace}:dismissed`, targetId);
    }
  };
  const update = async () => {
    if (unsafeRef.current || updating.current || !installedId) return;
    updating.current = true;
    setStatus("updating");
    try {
      const next = await check(true);
      if (!next) throw new Error("No connection");
      const target = buildIdentity(next.build);
      if (!target) throw new Error("Unknown build");
      if (target === installedId) {
        setStatus("ready");
        return;
      }
      // No service worker is shipped by this app. Unknown historical workers need
      // explicit recovery; never unregister them or delete origin storage blindly.
      if ("serviceWorker" in navigator) {
        const workers = await navigator.serviceWorker.getRegistrations();
        if (workers.length) {
          setStatus("worker");
          return;
        }
      }
      // Re-read live controller state after every await: a grade may have started.
      if (unsafeRef.current) {
        setStatus("ready");
        return;
      }
      window.location.replace(releaseUpdateUrl(window.location.href, target));
    } catch {
      if (mounted.current) setStatus("failed");
    } finally {
      updating.current = false;
    }
  };
  return {
    installed,
    release,
    status,
    updateAvailable,
    unread,
    attention: updateAvailable || unread,
    banner:
      storageReady && updateAvailable && targetId !== dismissed && !unsafe,
    unsafe,
    check: () => check(true),
    update,
    dismiss,
    markRead,
    development: !installedId,
  };
}
export type AppReleaseState = ReturnType<typeof useAppRelease>;
