// An accepted ordinary-card action invalidates prepared state for this meaning.
// This is browser cache coordination only; the server owns revisions and actions.
const listeners = new Set<(entryId: string | undefined, actualChange: boolean) => void>();

export function onPlatformV2CardStateChanged(listener: (entryId: string | undefined, actualChange: boolean) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishPlatformV2CardStateChanged(entryId?: string, actualChange = true) {
  for (const listener of listeners) listener(entryId, actualChange);
}
