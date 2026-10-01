// An accepted ordinary-card action invalidates prepared state for this meaning.
// This is browser cache coordination only; the server owns revisions and actions.
const listeners = new Set<(entryId: string) => void>();

export function onPlatformV2CardStateChanged(listener: (entryId: string) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishPlatformV2CardStateChanged(entryId: string) {
  for (const listener of listeners) listener(entryId);
}
