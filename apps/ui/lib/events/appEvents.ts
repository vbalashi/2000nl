'use client';

import { supabase } from '@/lib/supabaseClient';
import { createAppEventRegistry, type AppEvent, type AppEventConnection, type AppEventSubscription } from './appEventRegistry';
export * from './appEventRegistry';

// Supabase multiplexes all logical channels on its existing browser client's socket.
const registry = createAppEventRegistry({
  connect(topic, event, state) {
    let cancelled = false;
    let stop: (() => void) | undefined;
    // Resolve the principal before joining private topics, including initial page load.
    void supabase.auth.getSession().then(({ data, error }) => {
      if (cancelled) return;
      const userId = data.session?.user.id;
      if (error || !userId || (topic.startsWith('app:user:') && topic !== `app:user:${userId}`)) {
        state('degraded');
        return;
      }
      const channel = supabase.channel(topic, { config: { private: true } })
        .on('broadcast', { event: 'app-event' }, message => {
          const payload: unknown = message.payload;
          if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
          // realtime.send adds its transport message identity to the JSON payload.
          // Strip only that transport field; the domain parser remains closed.
          const { id, ...domainEvent } = payload as Record<string, unknown>;
          if (id !== undefined && (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) return;
          event(domainEvent);
        })
        .subscribe(status => {
          if (cancelled) return;
          if (status === 'SUBSCRIBED') state('connected');
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') state('degraded');
        });
      stop = () => { void supabase.removeChannel(channel); };
    }).catch(() => { if (!cancelled) state('degraded'); });
    return () => { cancelled = true; stop?.(); };
  },
});
let authStarted = false;
let principal: string | null | undefined;
function ensureAuthLifecycle() {
  if (authStarted) return;
  authStarted = true;
  // No async Supabase calls inside the auth callback: this runs under its auth lock.
  supabase.auth.onAuthStateChange((event, session) => {
    const next = session?.user.id ?? null;
    if (next === null || (principal !== undefined && principal !== next)) registry.clear();
    const samePrincipal = principal === next;
    principal = next;
    if (event === 'TOKEN_REFRESHED' && samePrincipal && next) {
      queueMicrotask(() => { if (principal === next) registry.reconnectAll(); });
    }
  });
}
export function subscribeAppEvents(options: AppEventSubscription, listener: (event: AppEvent) => void): () => void {
  ensureAuthLifecycle();
  return registry.subscribe(options, listener);
}
export function subscribeAppEventConnection(topic: string, listener: (state: AppEventConnection) => void): () => void {
  ensureAuthLifecycle();
  return registry.subscribeConnection(topic, listener);
}
