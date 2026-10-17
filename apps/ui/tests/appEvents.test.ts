import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: undefined as undefined | ((event: string, session: { user: { id: string } } | null) => void), channel: vi.fn(), remove: vi.fn(), session: vi.fn() }));
vi.mock('@/lib/supabaseClient', () => ({ supabase: { channel: mocks.channel, removeChannel: mocks.remove, auth: { getSession: mocks.session, onAuthStateChange: vi.fn(fn => { mocks.auth = fn; }) } } }));
const user = '11111111-1111-4111-8111-111111111111';
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); mocks.session.mockResolvedValue({ data: { session: { user: { id: user } } }, error: null }); });
describe('browser event transport', () => {
  it('uses the singleton private broadcast channel and removes it on logout', async () => {
    const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }; mocks.channel.mockReturnValue(channel);
    const { subscribeAppEvents, appUserTopic } = await import('@/lib/events/appEvents'); const listener = vi.fn();
    const unsubscribe = subscribeAppEvents({ topic: appUserTopic(user) }, listener);
    mocks.auth?.('INITIAL_SESSION', { user: { id: user } }); await vi.waitFor(() => expect(mocks.channel).toHaveBeenCalled());
    expect(mocks.channel).toHaveBeenCalledWith(appUserTopic(user), { config: { private: true } }); expect(channel.on).toHaveBeenCalledWith('broadcast', { event: 'app-event' }, expect.any(Function));
    mocks.auth?.('SIGNED_OUT', null); expect(mocks.remove).toHaveBeenCalledWith(channel); unsubscribe(); expect(mocks.remove).toHaveBeenCalledOnce();
  });
  it('rejoins on token refresh outside the auth callback and requests reconciliation', async () => {
    const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }; mocks.channel.mockReturnValue(channel);
    const { subscribeAppEvents, appUserTopic } = await import('@/lib/events/appEvents'); const reconcile = vi.fn();
    subscribeAppEvents({ topic: appUserTopic(user), onReconnect: reconcile }, vi.fn()); mocks.auth?.('INITIAL_SESSION', { user: { id: user } });
    await vi.waitFor(() => expect(mocks.channel).toHaveBeenCalledOnce()); channel.subscribe.mock.calls[0][0]('SUBSCRIBED');
    mocks.auth?.('TOKEN_REFRESHED', { user: { id: user } }); expect(mocks.remove).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(mocks.channel).toHaveBeenCalledTimes(2)); channel.subscribe.mock.calls[1][0]('SUBSCRIBED');
    expect(reconcile).toHaveBeenCalledOnce();
  });
  it('cancels a pending join on account switch and rejects wrong user topic', async () => {
    const { subscribeAppEvents, appUserTopic } = await import('@/lib/events/appEvents');
    subscribeAppEvents({ topic: appUserTopic(user) }, vi.fn()); mocks.auth?.('INITIAL_SESSION', { user: { id: user } }); mocks.auth?.('SIGNED_OUT', null); await Promise.resolve(); expect(mocks.channel).not.toHaveBeenCalled();
    subscribeAppEvents({ topic: appUserTopic('22222222-2222-4222-8222-222222222222') }, vi.fn()); await Promise.resolve(); expect(mocks.channel).not.toHaveBeenCalled();
  });
});
