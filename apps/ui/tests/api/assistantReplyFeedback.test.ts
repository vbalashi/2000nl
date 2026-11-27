/** @vitest-environment node */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/library/card-assistant/feedback/route";
import { issueAssistantFeedbackRef } from "@/lib/platform/assistantFeedbackRef";

const { upsert } = vi.hoisted(() => ({ upsert: vi.fn() }));

vi.mock("@/lib/platform/serverSupabase", () => ({
  getAuthenticatedSupabase: async () => ({ principal: { userId: "account", authKind: "first_party" } }),
  getPlatformServiceSupabase: () => ({ supabase: { from: () => ({ upsert }) } }),
  jsonNoStore: (body: unknown, status = 200) => Response.json(body, { status }),
}));

vi.mock("@/lib/audio/audioRateLimit", () => ({
  consumeAudioRateLimit: () => ({ allowed: true }),
}));

beforeEach(() => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "local-test-only");
  upsert.mockReset().mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function feedback(replyRef: string | undefined, fields: Record<string, unknown>) {
  return POST(new Request("http://localhost/api/library/card-assistant/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vote: "down", replyRef, ...fields }),
  }));
}

const excerpt = { question: "Which word fits?", answer: "Wandlamp." };

it.each([{}, { includeExcerpt: "true" }])("drops excerpt without an explicit boolean opt-in (%j)", async flags => {
  const ref = issueAssistantFeedbackRef("account", "search", "nl");
  expect((await feedback(ref, { ...excerpt, ...flags })).status).toBe(200);
  expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
    user_id: "account", journey: "search", excerpt_question: null, excerpt_answer: null,
  }), { onConflict: "reply_id" });
});

it("attaches only a complete opted-in excerpt", async () => {
  const ref = issueAssistantFeedbackRef("account", "draft", "nl");
  expect((await feedback(ref, { question: excerpt.question, includeExcerpt: true })).status).toBe(400);
  expect(upsert).not.toHaveBeenCalled();
  expect((await feedback(ref, { ...excerpt, includeExcerpt: true, reason: "example", comment: "Too formal." })).status).toBe(200);
  expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
    journey: "draft", reason: "example", comment: "Too formal.",
    excerpt_question: excerpt.question, excerpt_answer: excerpt.answer,
  }), { onConflict: "reply_id" });
});

it("rejects a reply reference belonging to another account", async () => {
  const ref = issueAssistantFeedbackRef("another-account", "search", "nl");
  expect((await feedback(ref, {})).status).toBe(400);
  expect(upsert).not.toHaveBeenCalled();
});
