export const APP_EVENT_KINDS = ['translation.ready', 'translation.failed', 'training.changed', 'learning.changed', 'account.changed', 'collections.changed', 'notes.changed', 'release.available'] as const;
export type AppEventKind = typeof APP_EVENT_KINDS[number];
export type AppEvent = { version: 1; eventId: string; kind: AppEventKind; occurredAt: string; resourceId?: string; language?: string; revision?: string };
export type AppEventConnection = { status: 'connecting' | 'connected' | 'degraded'; reconnect: boolean };
export const APP_RELEASES_TOPIC = 'app:releases';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function appUserTopic(userId: string): string { if (!uuid.test(userId)) throw new Error('Invalid user identity'); return `app:user:${userId}`; }
export function appTranslationTopic(entryId: string, language: string): string { if (!uuid.test(entryId) || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(language)) throw new Error('Invalid translation scope'); return `app:translation:${entryId}:${language}`; }
export function parseAppEvent(value: unknown): AppEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const e = value as Record<string, unknown>;
  if (Object.keys(e).some(k => !['version', 'eventId', 'kind', 'occurredAt', 'resourceId', 'language', 'revision'].includes(k))) return null;
  if (e.version !== 1 || typeof e.eventId !== 'string' || !uuid.test(e.eventId) || !APP_EVENT_KINDS.includes(e.kind as AppEventKind) || typeof e.occurredAt !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(e.occurredAt) || !Number.isFinite(Date.parse(e.occurredAt))) return null;
  for (const key of ['resourceId', 'language', 'revision']) if (e[key] !== undefined && (typeof e[key] !== 'string' || !(e[key] as string).length || (e[key] as string).length > 200)) return null;
  return e as AppEvent;
}
export type AppEventSubscription = { topic: string; kinds?: readonly AppEventKind[]; onReconnect?: () => void };
export type EventTransport = { connect: (topic: string, event: (payload: unknown) => void, state: (status: AppEventConnection['status']) => void) => () => void };
type Subscriber = { options: AppEventSubscription; listener: (event: AppEvent) => void };
type Topic = { subscribers: Set<Subscriber>; connections: Set<(state: AppEventConnection) => void>; stop?: () => void; state: AppEventConnection; seen: Set<string>; hasConnected: boolean; active: boolean; generation: number };
/** Transport-independent registry. All features sharing a topic share its subscription. */
export function createAppEventRegistry(transport: EventTransport) {
  const topics = new Map<string, Topic>();
  const safe = (fn: () => void) => { try { fn(); } catch { /* A consumer cannot break other subscribers. */ } };
  function ensure(name: string): Topic {
    const parts = name.split(':');
    const userTopic = parts.length === 3 && parts[0] === 'app' && parts[1] === 'user' && uuid.test(parts[2]);
    const translationTopic = parts.length === 4 && parts[0] === 'app' && parts[1] === 'translation' && uuid.test(parts[2]) && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(parts[3]);
    if (name !== APP_RELEASES_TOPIC && !userTopic && !translationTopic) throw new Error('Invalid event topic');
    let topic = topics.get(name);
    if (!topic) { topic = { subscribers: new Set(), connections: new Set(), state: { status: 'connecting', reconnect: false }, seen: new Set(), hasConnected: false, active: true, generation: 0 }; topics.set(name, topic); }
    return topic;
  }
  function start(name: string, topic: Topic) {
    if (topic.stop || !topic.active) return;
    const generation = ++topic.generation;
    const current = () => topic.active && topic.generation === generation;
    try {
      const stop = transport.connect(name, payload => {
        if (!current()) return;
        const event = parseAppEvent(payload);
        if (!event || topic.seen.has(event.eventId)) return;
        if (name.startsWith('app:user:') && (event.kind.startsWith('translation.') || event.kind === 'release.available')) return;
        if (name === APP_RELEASES_TOPIC && event.kind !== 'release.available') return;
        if (name.startsWith('app:translation:')) {
          const [, , entry, language] = name.split(':');
          if (!event.kind.startsWith('translation.') || event.resourceId !== entry || event.language !== language) return;
        }
        topic.seen.add(event.eventId);
        if (topic.seen.size > 512) topic.seen.delete(topic.seen.values().next().value!);
        for (const sub of topic.subscribers) if (!sub.options.kinds || sub.options.kinds.includes(event.kind)) safe(() => sub.listener(event));
      }, status => {
        if (!current()) return;
        const reconnect = status === 'connected' && topic.hasConnected && topic.state.status !== 'connected';
        topic.state = { status, reconnect };
        if (status === 'connected') topic.hasConnected = true;
        for (const fn of topic.connections) safe(() => fn(topic.state));
        if (reconnect) for (const sub of topic.subscribers) if (sub.options.onReconnect) safe(sub.options.onReconnect);
      });
      if (current()) topic.stop = stop; else stop();
    } catch { topic.state = { status: 'degraded', reconnect: false }; for (const fn of topic.connections) safe(() => fn(topic.state)); }
  }
  function release(name: string, topic: Topic) { if (topic.subscribers.size || topic.connections.size) return; if (!topic.active) return; topic.active = false; topic.stop?.(); if (topics.get(name) === topic) topics.delete(name); }
  return {
    subscribe(options: AppEventSubscription, listener: (event: AppEvent) => void) { const topic = ensure(options.topic); const sub = { options, listener }; topic.subscribers.add(sub); start(options.topic, topic); return () => { topic.subscribers.delete(sub); release(options.topic, topic); }; },
    subscribeConnection(name: string, listener: (state: AppEventConnection) => void) { const topic = ensure(name); topic.connections.add(listener); safe(() => listener(topic.state)); start(name, topic); return () => { topic.connections.delete(listener); release(name, topic); }; },
    reconnectAll() { for (const [name, topic] of topics) { topic.generation++; topic.stop?.(); topic.stop = undefined; topic.state = { status: 'connecting', reconnect: false }; for (const fn of topic.connections) safe(() => fn(topic.state)); start(name, topic); } },
    clear() { for (const topic of topics.values()) { topic.active = false; topic.state = { status: 'degraded', reconnect: false }; for (const fn of topic.connections) safe(() => fn(topic.state)); topic.stop?.(); topic.subscribers.clear(); topic.connections.clear(); } topics.clear(); },
  };
}
