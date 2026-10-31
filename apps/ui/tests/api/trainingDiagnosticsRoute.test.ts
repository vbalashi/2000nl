import { afterEach, beforeEach, expect, test, vi } from "vitest";
const auth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/platform/serverSupabase", () => ({
  getAuthenticatedSupabase: auth,
  jsonNoStore: (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status }),
}));
import { POST } from "@/app/api/diagnostics/training/route";
const event = {
  eventId: "event-1",
  kind: "load_stalled",
  operation: "transition",
  transitionId: "training-one",
  durationMs: 10000,
  online: true,
  foreground: true,
};
const request = (body: unknown, origin = "http://localhost") =>
  new Request("http://localhost/api/diagnostics/training", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  auth.mockReset();
  auth.mockResolvedValue({
    user: { id: crypto.randomUUID() },
    principal: { authKind: "first_party" },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});
test("derives account pseudonym from authentication and accepts a bounded batch", async () => {
  const output = vi.spyOn(console, "info").mockImplementation(() => {});
  expect((await POST(request([event]))).status).toBe(202);
  const row = JSON.parse(output.mock.calls[0][0]);
  expect(row).toMatchObject({
    channel: "training_diagnostics",
    kind: "client_event",
    event: "load_stalled",
    actor: expect.stringMatching(/^[a-f0-9]{24}$/),
  });
  expect(row).not.toHaveProperty("userId");
});
test("rejects foreign origins before authentication and logging", async () => {
  expect((await POST(request([event], "https://foreign.test"))).status).toBe(
    403,
  );
  expect(auth).not.toHaveBeenCalled();
});
test("rejects supplied identity, free text and oversized payloads", async () => {
  expect(
    (await POST(request([{ ...event, userId: "other-account" }]))).status,
  ).toBe(400);
  expect((await POST(request([{ ...event, message: "secret" }]))).status).toBe(
    400,
  );
  expect((await POST(request("x".repeat(13000)))).status).toBe(413);
  expect(auth).not.toHaveBeenCalled();
});
test("keeps unauthenticated and connected-client events out of the log", async () => {
  const output = vi.spyOn(console, "info").mockImplementation(() => {});
  auth.mockResolvedValueOnce(new Response(null, { status: 401 }));
  expect((await POST(request([event]))).status).toBe(401);
  auth.mockResolvedValueOnce({
    user: { id: "user" },
    principal: { authKind: "connected_client" },
  });
  expect((await POST(request([event]))).status).toBe(403);
  expect(output).not.toHaveBeenCalled();
});
test("limits multiple tabs sharing one authenticated account", async () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  for (let i = 0; i < 12; i++)
    expect((await POST(request(Array(20).fill(event)))).status).toBe(202);
  expect((await POST(request([event]))).status).toBe(429);
});

vi.mock("@/lib/diagnostics/serverPolicy",()=>({diagnosticPolicyFor:()=>({enabled:true,detailed:true,successSampleRate:1,validUntil:Date.now()+90_000})}));
