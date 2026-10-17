import { describe, expect, it, vi } from 'vitest';
import { APP_RELEASES_TOPIC, appTranslationTopic, appUserTopic, createAppEventRegistry, parseAppEvent, type AppEventConnection } from '@/lib/events/appEventRegistry';
const id = '11111111-1111-4111-8111-111111111111';
const event = { version: 1, eventId: id, kind: 'translation.ready', resourceId: id, language: 'en', occurredAt: '2026-10-17T12:00:00Z' };
function fixture() {
  const channels: { event: (e: unknown) => void; state: (s: AppEventConnection['status']) => void; stop: ReturnType<typeof vi.fn> }[] = [];
  const registry = createAppEventRegistry({ connect(_topic, event, state) { const stop = vi.fn(); channels.push({ event, state, stop }); return stop; } });
  return { registry, channels };
}
describe('shared app event registry', () => {
  it('shares a connection and releases only after its last listener', () => {
    const { registry, channels } = fixture();
    const a = registry.subscribe({ topic: appTranslationTopic(id, 'en') }, vi.fn());
    const b = registry.subscribe({ topic: appTranslationTopic(id, 'en') }, vi.fn());
    expect(channels).toHaveLength(1); a(); expect(channels[0].stop).not.toHaveBeenCalled(); b(); expect(channels[0].stop).toHaveBeenCalledOnce();
  });
  it('validates payload, filters kinds and scope, and deduplicates notifications', () => {
    const { registry, channels } = fixture(); const listener = vi.fn();
    registry.subscribe({ topic: appTranslationTopic(id, 'en'), kinds: ['translation.ready'] }, listener);
    channels[0].event({ ...event, version: 2 }); channels[0].event({ ...event, language: 'ru' }); channels[0].event({ ...event, secret: 'unexpected' });
    channels[0].event(event); channels[0].event(event); expect(listener).toHaveBeenCalledOnce();
  });
  it('reconciles after reconnect and isolates faulty subscribers', () => {
    const { registry, channels } = fixture(); const reconcile = vi.fn(); const listener = vi.fn();
    registry.subscribe({ topic: appUserTopic(id), onReconnect: reconcile }, () => { throw new Error('consumer'); });
    registry.subscribe({ topic: appUserTopic(id) }, listener);
    channels[0].state('connected'); expect(reconcile).not.toHaveBeenCalled(); channels[0].state('degraded'); channels[0].state('connected'); expect(reconcile).toHaveBeenCalledOnce();
    channels[0].event({ ...event, kind: 'learning.changed' }); expect(listener).toHaveBeenCalledOnce();
  });
  it('discards old callbacks and connections when authentication scope changes', () => {
    const { registry, channels } = fixture(); const listener = vi.fn();
    registry.subscribe({ topic: appUserTopic(id) }, listener); registry.clear(); channels[0].event(event);
    expect(listener).not.toHaveBeenCalled(); expect(channels[0].stop).toHaveBeenCalledOnce();
    registry.subscribe({ topic: appUserTopic(id) }, listener); expect(channels).toHaveLength(2);
  });
  it('rejoins with listeners preserved and ignores retired channel callbacks', () => {
    const { registry, channels } = fixture(); const listener = vi.fn(); const reconcile = vi.fn(); registry.subscribe({ topic: appUserTopic(id), onReconnect: reconcile }, listener);
    channels[0].state('connected'); registry.reconnectAll(); expect(channels[0].stop).toHaveBeenCalledOnce();
    channels[0].event({ ...event, kind: 'learning.changed' }); expect(listener).not.toHaveBeenCalled(); channels[1].state('connected'); expect(reconcile).toHaveBeenCalledOnce();
    channels[1].event({ ...event, kind: 'learning.changed' }); expect(listener).toHaveBeenCalledOnce();
  });
  it('restricts release topic event kinds', () => {
    const { registry, channels } = fixture(); const listener = vi.fn(); registry.subscribe({ topic: APP_RELEASES_TOPIC }, listener);
    channels[0].event(event); expect(listener).not.toHaveBeenCalled(); channels[0].event({ ...event, kind: 'release.available' }); expect(listener).toHaveBeenCalledOnce();
  });
  it('degrades when transport is unavailable without requiring database', () => {
    const registry = createAppEventRegistry({ connect() { throw new Error('unavailable'); } }); const listener = vi.fn();
    registry.subscribeConnection(APP_RELEASES_TOPIC, listener); expect(listener).toHaveBeenLastCalledWith({ status: 'degraded', reconnect: false });
  });
  it('bounds duplicate history and refuses malformed topics and payloads', () => {
    const { registry, channels } = fixture(); const listener = vi.fn(); registry.subscribe({ topic: appUserTopic(id) }, listener);
    for (let i = 0; i < 513; i++) channels[0].event({ ...event, kind: 'learning.changed', eventId: `${i.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111` });
    channels[0].event({ ...event, kind: 'learning.changed', eventId: '00000000-1111-4111-8111-111111111111' }); expect(listener).toHaveBeenCalledTimes(514);
    expect(() => registry.subscribe({ topic: 'arbitrary' }, listener)).toThrow(); expect(parseAppEvent({ ...event, occurredAt: 'bad' })).toBeNull();
  });
});
