import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const rpc = vi.fn();
const getUser = vi.fn();
const createClient = vi.fn(() => ({
  auth: { getUser },
  rpc,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient,
}));

const request = (body: unknown) =>
  new NextRequest("http://localhost/api/platform/v2/training/idioms", {
    method: "POST",
    headers: {
      authorization: "Bearer user-token",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

describe("/api/platform/v2/training/idioms", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    process.env.PLATFORM_V2_IDIOM_EXERCISES_ENABLED = "1";
    delete process.env.PLATFORM_API_ALLOWED_ORIGINS;
    getUser.mockReset();
    rpc.mockReset();
    createClient.mockClear();
    getUser.mockResolvedValue({
      data: { user: { id: "00000000-0000-4000-8000-000000000001" } },
      error: null,
    });
  });

  test("stays fail-closed until the idiom exercise gate is enabled", async () => {
    delete process.env.PLATFORM_V2_IDIOM_EXERCISES_ENABLED;
    const { POST } = await import(
      "@/app/api/platform/v2/training/idioms/route"
    );

    const response = await POST(request({ direction: "direct" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "platform_v2_idiom_exercises_not_enabled",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("returns the content-bound idiom candidates without raw provider data", async () => {
    rpc.mockResolvedValueOnce({
      data: {
        family: "idiom",
        direction: "direct",
        items: [
          {
            targetId: "00000000-0000-4000-8000-000000000010",
            targetKey: "idiom:entry-1:node-1:direct",
            family: "idiom",
            direction: "direct",
            entryId: "00000000-0000-4000-8000-000000000011",
            contentNodeId: "00000000-0000-4000-8000-000000000012",
            expressionSourcePath: "raw.meanings[0].idioms[0].expression",
            explanationSourcePath: "raw.meanings[0].idioms[0].explanation",
            exampleSourcePaths: ["raw.meanings[0].idioms[0].examples[0]"],
            sourceRevision: "revision-1",
            sourceTextFingerprint: "fingerprint-1",
            queueSource: "new",
            state: null,
            raw: { providerSecret: "must-not-leak" },
          },
        ],
      },
      error: null,
    });
    const { POST } = await import(
      "@/app/api/platform/v2/training/idioms/route"
    );

    const response = await POST(
      request({ direction: "direct", limit: 1, offset: 0 }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({
      contractVersion: "platform-idiom-exercise-candidates-v2",
      family: "idiom",
      direction: "direct",
      items: [
        expect.objectContaining({
          targetId: "00000000-0000-4000-8000-000000000010",
          queueSource: "new",
          state: null,
        }),
      ],
    });
    expect(JSON.stringify(payload)).not.toContain("providerSecret");
    expect(rpc).toHaveBeenCalledWith(
      "read_platform_v2_idiom_exercise_candidates_as_principal_v1",
      {
        p_user_id: "00000000-0000-4000-8000-000000000001",
        p_direction: "direct",
        p_limit: 1,
        p_offset: 0,
      },
    );
  });

  test("fails closed when the candidate RPC returns a malformed item", async () => {
    rpc.mockResolvedValueOnce({
      data: {
        family: "idiom",
        direction: "direct",
        items: [{ targetId: "not-a-complete-candidate" }],
      },
      error: null,
    });
    const { POST } = await import(
      "@/app/api/platform/v2/training/idioms/route"
    );

    const response = await POST(request({ direction: "direct" }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_platform_v2_idiom_exercise_response",
    });
  });

  test("rejects invalid direction and out-of-range page size before the RPC", async () => {
    const { POST } = await import(
      "@/app/api/platform/v2/training/idioms/route"
    );

    const invalidDirection = await POST(request({ direction: "meaning" }));
    const invalidLimit = await POST(request({ direction: "reverse", limit: 0 }));

    expect(invalidDirection.status).toBe(400);
    await expect(invalidDirection.json()).resolves.toEqual({
      error: "invalid_idiom_exercise_direction",
    });
    expect(invalidLimit.status).toBe(400);
    await expect(invalidLimit.json()).resolves.toEqual({
      error: "invalid_idiom_exercise_limit",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
