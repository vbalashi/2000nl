import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { subscribeUserEventHints } from "@/lib/events/userEventHints";
const transport = vi.hoisted(() => ({ subscriptions: [] as { options: any; listener: any }[], connections: [] as ((state: any) => void)[], detach: vi.fn() }));
vi.mock("@/lib/events/appEvents", () => ({
  appUserTopic: (userId: string) => { if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("invalid owner"); return `app:user:${userId}`; },
  subscribeAppEvents: (options: any, listener: any) => { transport.subscriptions.push({ options, listener }); return transport.detach; },
  subscribeAppEventConnection: (_topic: string, listener: any) => { transport.connections.push(listener); return transport.detach; },
}));
beforeEach(() => { vi.useFakeTimers(); transport.subscriptions.length = 0; transport.connections.length = 0; transport.detach.mockClear(); });
afterEach(() => { vi.useRealTimers(); });
test("first join, reconnect and event bursts coalesce scoped authoritative reads", async () => {
  const refresh = vi.fn().mockResolvedValue(undefined);
  const subscription = subscribeUserEventHints("11111111-1111-4111-8111-111111111111", ["account.changed"], refresh);
  expect(transport.subscriptions[0].options).toMatchObject({ topic: "app:user:11111111-1111-4111-8111-111111111111", kinds: ["account.changed"] });
  transport.connections[0]({ status: "connected", reconnect: false });
  transport.subscriptions[0].listener({ kind: "account.changed", resourceId: "user_settings" });
  transport.subscriptions[0].listener({ kind: "account.changed" });
  await vi.advanceTimersByTimeAsync(1);
  expect(refresh).toHaveBeenCalledOnce();
  transport.subscriptions[0].listener({ kind: "account.changed", resourceId: "unrelated" });
  await vi.advanceTimersByTimeAsync(1);
  expect(refresh).toHaveBeenCalledOnce();
  transport.connections[0]({ status: "degraded", reconnect: false });
  transport.connections[0]({ status: "connected", reconnect: true });
  await vi.advanceTimersByTimeAsync(1);
  expect(refresh).toHaveBeenCalledTimes(2);
  subscription.dispose();
  expect(transport.detach).toHaveBeenCalledTimes(2);
});
test("blocked writes retain a dirty hint until their owner flushes; disposal cancels queued reads", async () => {
  let pending = true;
  const refresh = vi.fn().mockResolvedValue(undefined);
  const subscription = subscribeUserEventHints("11111111-1111-4111-8111-111111111111", ["collections.changed"], refresh, () => pending);
  transport.subscriptions[0].listener({ kind: "collections.changed" });
  transport.connections[0]({ status: "connected" });
  await vi.advanceTimersByTimeAsync(1);
  expect(refresh).not.toHaveBeenCalled();
  pending = false;
  subscription.flush();
  await vi.advanceTimersByTimeAsync(1);
  expect(refresh).toHaveBeenCalledOnce();
  transport.subscriptions[0].listener({ kind: "collections.changed" });
  subscription.dispose();
  await vi.advanceTimersByTimeAsync(1);
  expect(refresh).toHaveBeenCalledOnce();
});
test("a burst received during a read schedules one follow-up read", async () => {
  let finish!: () => void;
  const refresh = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; })).mockResolvedValue(undefined);
  const subscription = subscribeUserEventHints("11111111-1111-4111-8111-111111111111", ["training.changed"], refresh);
  transport.subscriptions[0].listener({ kind: "training.changed" });
  await vi.advanceTimersByTimeAsync(0);
  transport.subscriptions[0].listener({ kind: "training.changed" });
  transport.subscriptions[0].listener({ kind: "training.changed" });
  finish();
  await vi.advanceTimersByTimeAsync(1);
  expect(refresh).toHaveBeenCalledTimes(2);
  subscription.dispose();
});


test("missed broadcasts reconcile every fifteen healthy visible minutes or one degraded minute", async () => {
  const refresh = vi.fn().mockResolvedValue(undefined);
  const subscription = subscribeUserEventHints("11111111-1111-4111-8111-111111111111", ["account.changed"], refresh);
  transport.connections[0]({ status: "connected", reconnect: false });
  await vi.advanceTimersByTimeAsync(1);
  expect(refresh).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(14 * 60_000);
  expect(refresh).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(refresh).toHaveBeenCalledTimes(2);
  transport.connections[0]({ status: "degraded", reconnect: false });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(refresh).toHaveBeenCalledTimes(3);
  subscription.dispose();
  await vi.advanceTimersByTimeAsync(30 * 60_000);
  expect(refresh).toHaveBeenCalledTimes(3);
});

test("safety reads stay quiet while hidden and resume when visible", async () => {
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  const refresh = vi.fn().mockResolvedValue(undefined);
  const subscription = subscribeUserEventHints("11111111-1111-4111-8111-111111111111", ["collections.changed"], refresh);
  try {
    await vi.advanceTimersByTimeAsync(20 * 60_000);
    expect(refresh).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    await vi.advanceTimersByTimeAsync(60_000 + 1);
    expect(refresh).toHaveBeenCalledOnce();
  } finally { subscription.dispose(); visibility.mockRestore(); }
});

test.each([undefined, "signed-out", "owner"])("does not subscribe or poll invalid principal %s", async userId => {
  const refresh = vi.fn();
  const subscription = subscribeUserEventHints(userId, ["account.changed"], refresh);
  expect(transport.subscriptions).toHaveLength(0);
  await vi.advanceTimersByTimeAsync(60 * 60_000);
  expect(refresh).not.toHaveBeenCalled();
  subscription.dispose();
});
