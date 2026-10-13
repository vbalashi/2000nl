type ReadyTranslation = { entryId: string; targetLanguageCode: string };
const listeners = new Set<(translation: ReadyTranslation) => void>();
const revalidators = new Set<() => void>();
const channelName = "2000nl.dictionary-translation.v1";
const storageKey = "2000nl.dictionary-translation.invalidation.v1";
const seen = new Set<string>();
let channel: BroadcastChannel | null = null;
let cleanup: (() => void) | null = null;
function deliver(translation: ReadyTranslation) {
  for (const listener of [...listeners]) {
    try {
      listener(translation);
    } catch {
      /* Display failure cannot fail completed translation. */
    }
  }
}
function initialize() {
  if (cleanup || typeof window === "undefined") return;
  const receive = (data: unknown) => {
    if (!data || typeof data !== "object") return;
    const event = data as Record<string, unknown>;
    if (
      Object.keys(event).sort().join() !==
        "entryId,id,targetLanguageCode,type" ||
      event.type !== "ready" ||
      typeof event.id !== "string" ||
      event.id.length > 128 ||
      seen.has(event.id) ||
      typeof event.entryId !== "string" ||
      !event.entryId ||
      event.entryId.length > 128 ||
      typeof event.targetLanguageCode !== "string" ||
      !/^[a-z]{2,3}(-[a-z0-9]{2,8}){0,3}$/.test(event.targetLanguageCode)
    )
      return;
    seen.add(event.id);
    if (seen.size > 128) seen.delete(seen.values().next().value!);
    // Received hints are delivered locally, never broadcast again.
    deliver({
      entryId: event.entryId,
      targetLanguageCode: event.targetLanguageCode,
    });
  };
  try {
    channel = new BroadcastChannel(channelName);
    channel.onmessage = (event) => receive(event.data);
  } catch {
    channel = null;
  }
  const storage = (event: StorageEvent) => {
    if (event.key === storageKey && event.newValue) {
      try {
        receive(JSON.parse(event.newValue));
      } catch {}
    }
  };
  const revalidate = () => {
    if (document.visibilityState !== "hidden")
      for (const listener of [...revalidators]) {
        try {
          listener();
        } catch {}
      }
  };
  window.addEventListener("storage", storage);
  window.addEventListener("focus", revalidate);
  document.addEventListener("visibilitychange", revalidate);
  const timer = window.setInterval(revalidate, 60_000);
  cleanup = () => {
    channel?.close();
    channel = null;
    window.removeEventListener("storage", storage);
    window.removeEventListener("focus", revalidate);
    document.removeEventListener("visibilitychange", revalidate);
    window.clearInterval(timer);
    cleanup = null;
    seen.clear();
  };
}
function release() {
  if (!listeners.size && !revalidators.size) cleanup?.();
}
/** Public dictionary identity only. No text, learner state, or authority to publish ready. */
export function onDictionaryTranslationReady(
  listener: (translation: ReadyTranslation) => void,
) {
  listeners.add(listener);
  initialize();
  return () => {
    listeners.delete(listener);
    release();
  };
}
export function onDictionaryTranslationRevalidate(listener: () => void) {
  revalidators.add(listener);
  initialize();
  return () => {
    revalidators.delete(listener);
    release();
  };
}
export function publishDictionaryTranslationReady(
  translation: ReadyTranslation,
) {
  initialize();
  deliver(translation);
  if (typeof window === "undefined") return;
  const id =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}:${Math.random()}`;
  const event = {
    type: "ready",
    id,
    entryId: translation.entryId,
    targetLanguageCode: translation.targetLanguageCode,
  };
  seen.add(id);
  if (seen.size > 128) seen.delete(seen.values().next().value!);
  try {
    channel?.postMessage(event);
  } catch {}
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(event));
    window.localStorage.removeItem(storageKey);
  } catch {
    /* Storage-disabled browsers still have channel/focus recovery. */
  }
  release();
}
