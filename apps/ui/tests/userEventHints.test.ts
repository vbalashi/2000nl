import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { subscribeUserEventHints } from "@/lib/events/userEventHints";
const transport = vi.hoisted(() => ({ subscriptions: [] as { options: any; listener: any }[], connections: [] as ((state: any) => void)[], detach: vi.fn() }));
vi.mock("@/lib/events/appEvents", () => ({
  appUserTopic: (userId: string) => `app:user:${userId}`,
  subscribeAppEvents: (options: any, listener: any) => { transport.subscriptions.push({ options, listener }); return transport.detach; },
  subscribeAppEventConnection: (_topic: string, listener: any) => { transport.connections.push(listener); return transport.detach; },
}));
beforeEach(() => { vi.useFakeTimers(); transport.subscriptions.length = 0; transport.connections.length = 0; transport.detach.mockClear(); });
afterEach(() => { vi.useRealTimers(); });
test("first join, reconnect and event bursts coalesce scoped authoritative reads", async () => {
  const refresh = vi.fn().mockResolvedValue(undefined);
  const subscription = subscribeUserEventHints("owner", ["account.changed"], refresh);
  expect(transport.subscriptions[0].options).toMatchObject({ topic: "app:user:owner", kinds: ["account.changed"] });
  transport.connections[0]({ status: "connected", reconnect: false });
  transport.subscriptions[0].listener({ kind: "account.changed", resourceId: "user_settings" });
  transport.subscriptions[0].listener({ kind: "account.changed" });
  await vi.runAllTimersAsync();
  expect(refresh).toHaveBeenCalledOnce();
  transport.subscriptions[0].listener({ kind: "account.changed", resourceId: "unrelated" });
  await vi.runAllTimersAsync();
  expect(refresh).toHaveBeenCalledOnce();
  transport.connections[0]({ status: "degraded", reconnect: false });
  transport.connections[0]({ status: "connected", reconnect: true });
  await vi.runAllTimersAsync();
  expect(refresh).toHaveBeenCalledTimes(2);
  subscription.dispose();
  expect(transport.detach).toHaveBeenCalledTimes(2);
});
test("blocked writes retain a dirty hint until their owner flushes; disposal cancels queued reads", async () => {
  let pending = true;
  const refresh = vi.fn().mockResolvedValue(undefined);
  const subscription = subscribeUserEventHints("owner", ["collections.changed"], refresh, () => pending);
  transport.subscriptions[0].listener({ kind: "collections.changed" });
  transport.connections[0]({ status: "connected" });
  await vi.runAllTimersAsync();
  expect(refresh).not.toHaveBeenCalled();
  pending = false;
  subscription.flush();
  await vi.runAllTimersAsync();
  expect(refresh).toHaveBeenCalledOnce();
  transport.subscriptions[0].listener({ kind: "collections.changed" });
  subscription.dispose();
  await vi.runAllTimersAsync();
  expect(refresh).toHaveBeenCalledOnce();
});
test("a burst received during a read schedules one follow-up read", async () => {
  let finish!: () => void;
  const refresh = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; })).mockResolvedValue(undefined);
  const subscription = subscribeUserEventHints("owner", ["training.changed"], refresh);
  transport.subscriptions[0].listener({ kind: "training.changed" });
  await vi.advanceTimersByTimeAsync(0);
  transport.subscriptions[0].listener({ kind: "training.changed" });
  transport.subscriptions[0].listener({ kind: "training.changed" });
  finish();
  await vi.runAllTimersAsync();
  expect(refresh).toHaveBeenCalledTimes(2);
  subscription.dispose();
});
