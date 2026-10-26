import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const rpc = vi.fn();
const getUser = vi.fn();
const createClient = vi.fn(() => ({ auth: { getUser }, rpc }));

vi.mock("@supabase/supabase-js", () => ({ createClient }));

const request = (body: unknown) =>
  new NextRequest("http://localhost/api/platform/v2/training/translations", {
    method: "POST",
    headers: {
      authorization: "Bearer user-token",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

describe("/api/platform/v2/training/translations", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    process.env.PLATFORM_V2_TRANSLATION_EXERCISES_ENABLED = "1";
    delete process.env.PLATFORM_API_ALLOWED_ORIGINS;
    getUser.mockReset();
    rpc.mockReset();
    createClient.mockClear();
    getUser.mockResolvedValue({
      data: { user: { id: "00000000-0000-4000-8000-000000000001" } },
      error: null,
    });
  });

  test("stays fail-closed until the translation exercise gate is enabled", async () => {
    delete process.env.PLATFORM_V2_TRANSLATION_EXERCISES_ENABLED;
    const { POST } = await import(
      "@/app/api/platform/v2/training/translations/route"
    );

    const response = await POST(request({ limit: 1 }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "platform_v2_translation_exercises_not_enabled",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("returns sentence candidates without requiring a cached translation", async () => {
    rpc.mockResolvedValueOnce({
      data: {
        contractVersion: "platform-translation-exercise-candidates-v1",
        family: "translation",
        direction: "recall",
        items: [
          {
            targetId: "00000000-0000-4000-8000-000000000010",
            targetKey: "translation:entry-1:node-1:recall",
            family: "translation",
            direction: "recall",
            entryId: "00000000-0000-4000-8000-000000000011",
            contentNodeId: "00000000-0000-4000-8000-000000000012",
            sourcePath: "raw.meanings[0].examples[0]",
            sourceRevision: "revision-1",
            sourceTextFingerprint: "fingerprint-1",
            queueSource: "new",
            state: null,
          },
        ],
      },
      error: null,
    });
    const { POST } = await import(
      "@/app/api/platform/v2/training/translations/route"
    );

    const response = await POST(request({ limit: 1, offset: 0 }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      contractVersion: "platform-translation-exercise-candidates-v1",
      family: "translation",
      direction: "recall",
      items: [expect.objectContaining({ queueSource: "new", state: null })],
    });
    expect(rpc).toHaveBeenCalledWith(
      "read_platform_v2_translation_candidates_as_principal_v1",
      {
        p_user_id: "00000000-0000-4000-8000-000000000001",
        p_limit: 1,
        p_offset: 0,
      },
    );
  });

  test("rejects malformed candidates before exposing them", async () => {
    rpc.mockResolvedValueOnce({
      data: { family: "translation", direction: "recall", items: [{}] },
      error: null,
    });
    const { POST } = await import(
      "@/app/api/platform/v2/training/translations/route"
    );

    const response = await POST(request({}));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_platform_v2_translation_exercise_response",
    });
  });
});
