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

const history = [
  { question: "Which word fits?", answer: "Wandlamp." },
  { question: "Is this also a sconce?", answer: "Yes, it can be." },
];

it.each([{}, { includeHistory: "true" }])("drops chat history without boolean opt-in (%j)", async flags => {
  const ref = issueAssistantFeedbackRef("account", "search", "nl");
  expect((await feedback(ref, { history, ...flags })).status).toBe(200);
  expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
    user_id: "account", journey: "search", chat_history: null, excerpt_question: null, excerpt_answer: null,
  }), { onConflict: "reply_id" });
});

it.each([
  { invalid: [] },
  { invalid: [...history, { question: "Incomplete" }] },
  { invalid: Array(9).fill(history[0]) },
])(
  "rejects malformed or oversized opted-in history (%j)", async ({ invalid }) => {
    const ref = issueAssistantFeedbackRef("account", "draft", "nl");
    expect((await feedback(ref, { history: invalid, includeHistory: true })).status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  },
);

it("attaches ordered messages only to an opted-in downvote", async () => {
  const ref = issueAssistantFeedbackRef("account", "draft", "nl");
  expect((await feedback(ref, { history, includeHistory: true, reason: "example", comment: "Too formal." })).status).toBe(200);
  expect(upsert).toHaveBeenLastCalledWith(expect.objectContaining({
    journey: "draft", reason: "example", comment: "Too formal.", chat_history: history,
  }), { onConflict: "reply_id" });

  expect((await feedback(ref, { history, includeHistory: true, vote: "up" })).status).toBe(200);
  expect(upsert).toHaveBeenLastCalledWith(expect.objectContaining({
    vote: "up", reason: null, comment: null, chat_history: null,
  }), { onConflict: "reply_id" });
});

it("rejects a reply reference belonging to another account", async () => {
  const ref = issueAssistantFeedbackRef("another-account", "search", "nl");
  expect((await feedback(ref, { history, includeHistory: true })).status).toBe(400);
  expect(upsert).not.toHaveBeenCalled();
});
