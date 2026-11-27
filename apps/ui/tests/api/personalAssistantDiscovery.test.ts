/** @vitest-environment node */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/library/card-assistant/route";

vi.mock("@/lib/platform/assistantAccess", () => ({
  readAssistantAccess: vi.fn(),
  requireAssistantAccess: async () => ({ principal: { userId: "test-user" } }),
}));
vi.mock("@/lib/platform/serverSupabase", () => ({
  jsonNoStore: (body: unknown, status = 200) => Response.json(body, { status }),
  getPlatformServiceSupabase: () => ({
    supabase: {
      rpc: () => ({
        abortSignal: async () => ({
          data: { groups: [{ items: [
            { entry: { id: "soup", headword: "soep", summaryDefinition: "vloeibaar gerecht" }, dictionary: { id: "demo", name: "Demo" } },
            { entry: { id: "ladle", headword: "soeplepel", summaryDefinition: "grote lepel om soep op te scheppen" }, dictionary: { id: "demo", name: "Demo" } },
          ] }] },
        }),
      }),
    },
  }),
}));

beforeEach(() => {
  vi.stubEnv("AZURE_OPENAI_API_KEY", "");
  vi.stubEnv("OPENAI_API_KEY", "test");
  vi.stubEnv("TRANSLATION_PROMPTS_JSON", JSON.stringify({ "personal_card_search_v1.txt": "Return matched IDs as JSON." }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function discover(matches?: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({
    choices: [{ message: { tool_calls: [{
      id: "lookup",
      function: { name: "search_library", arguments: '{"query":"soeplepel"}' },
    }] } }],
  })).mockResolvedValueOnce(Response.json({
    choices: [{ message: { content: JSON.stringify({ message: "A ladle is a soeplepel.", matches }) } }],
  })));
  return POST(new NextRequest("http://localhost/api/library/card-assistant", {
    method: "POST",
    body: JSON.stringify({
      word: "soep",
      definition: "",
      question: "What is the word for a soup ladle?",
      intent: "find-meaning",
      languageCode: "nl",
      interfaceLanguage: "en",
    }),
  }));
}

it("rejects a provider answer without its required list of confirmed matches", async () => {
  const response = await discover();
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: "invalid_answer" });
});

it("returns confirmed matches without adding unselected or fabricated sources", async () => {
  const response = await discover(["fabricated", "ladle", "ladle"]);
  expect(response.status).toBe(200);
  expect((await response.json()).sources.map((hit: { entryId: string }) => hit.entryId)).toEqual(["ladle"]);
});

it("preserves a valid empty match list", async () => {
  expect((await (await discover([])).json()).sources).toEqual([]);
});
