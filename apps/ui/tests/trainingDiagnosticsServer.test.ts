import { afterEach, expect, test, vi } from "vitest";
import {
  diagnosticSupabaseFetch,
  identifyDiagnosticActor,
  withTrainingDiagnostics,
} from "@/lib/diagnostics/server";

afterEach(() => {
  vi.restoreAllMocks();
});
test("correlates route and RPC without leaking query, auth, identity or errors", async () => {
  const output = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("private-response", { status: 200 }),
  );
  const handler = withTrainingDiagnostics(
    "/api/platform/v2/lookup",
    async () => {
      identifyDiagnosticActor("private-user-id");
      await diagnosticSupabaseFetch(
        "https://example.com/rest/v1/rpc/read_current_training_entry_v1?secret=private-query",
        {
          headers: { authorization: "Bearer private-token" },
          body: "private-body",
        },
      );
      return new Response("private-card");
    },
  );
  const response = await handler(
    new Request("http://localhost/api/platform/v2/lookup", {
      headers: {
        "x-request-id": "req-1",
        "x-training-transition-id": "training-one",
      },
    }),
  );
  const logs = output.mock.calls.map(([line]) => JSON.parse(line));
  expect(response.headers.get("x-request-id")).toBe("req-1");
  expect(logs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "server_rpc",
        requestId: "req-1",
        transitionId: "training-one",
        rpc: "read_current_training_entry_v1",
        status: 200,
      }),
      expect.objectContaining({
        kind: "server_request",
        requestId: "req-1",
        actor: expect.stringMatching(/^[a-f0-9]{24}$/),
      }),
    ]),
  );
  expect(JSON.stringify(logs)).not.toMatch(/private-/);
});
test("records thrown failures and concurrent identities stay isolated", async () => {
  const output = vi.spyOn(console, "info").mockImplementation(() => {});
  const handler = withTrainingDiagnostics(
    "/api/platform/v2/lookup",
    async (request) => {
      identifyDiagnosticActor(request.headers.get("actor")!);
      await Promise.resolve();
      if (request.headers.get("actor") === "a")
        throw new Error("sensitive-error");
      return new Response("ok");
    },
  );
  await Promise.allSettled([
    handler(
      new Request("http://localhost", {
        headers: { actor: "a", "x-request-id": "request-a" },
      }),
    ),
    handler(
      new Request("http://localhost", {
        headers: { actor: "b", "x-request-id": "request-b" },
      }),
    ),
  ]);
  const logs = output.mock.calls
    .map(([line]) => JSON.parse(line))
    .filter((l) => l.kind === "server_request");
  expect(logs.find((l) => l.requestId === "request-a").status).toBe(500);
  expect(logs.find((l) => l.requestId === "request-b").status).toBe(200);
  expect(logs[0].actor).not.toBe(logs[1].actor);
  expect(JSON.stringify(logs)).not.toContain("sensitive-error");
});

vi.mock("@/lib/diagnostics/serverPolicy",()=>({diagnosticPolicyFor:()=>({enabled:true,detailed:true,successSampleRate:1,validUntil:Date.now()+90_000})}));
