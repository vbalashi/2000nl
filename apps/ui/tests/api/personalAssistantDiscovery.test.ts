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
  vi.stubEnv("TRANSLATION_PROMPTS_JSON", JSON.stringify({
    "personal_card_search_v1.txt": "Return matched IDs as JSON.",
    "personal_card_editor_v1.txt": "Return draft suggestions as JSON.",
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function discover(matches?: unknown, reply: Record<string, unknown> = {}, intent = "find-meaning") {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({
    choices: [{ message: { tool_calls: [{
      id: "lookup",
      function: { name: "search_library", arguments: '{"query":"soeplepel"}' },
    }] } }],
  })).mockResolvedValueOnce(Response.json({
    choices: [{ message: { content: JSON.stringify({ message: "A ladle is a soeplepel.", matches, ...reply }) } }],
  })));
  return POST(new NextRequest("http://localhost/api/library/card-assistant", {
    method: "POST",
    body: JSON.stringify({
      word: "soep",
      definition: "",
      question: "What is the word for a soup ladle?",
      intent,
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

it.each(["", "eigen keuze"])("only returns a valid headword for an empty draft (headword=%j)", async (word) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
    choices: [{ message: { content: JSON.stringify({
      message: "Here is a draft.",
      suggestions: [
        { kind: "headword", text: "  op de hoogte houden  " },
        { kind: "headword", text: "line one\nline two" },
        { kind: "headword", text: "x".repeat(301) },
        { kind: "definition", text: "iemand blijven informeren" },
      ],
    }) } }],
  })));
  const response = await POST(new NextRequest("http://localhost/api/library/card-assistant", {
    method: "POST",
    body: JSON.stringify({
      word, definition: "", question: "Help me draft an expression for keeping someone informed.",
      languageCode: "nl", interfaceLanguage: "en",
    }),
  }));

  expect(response.status).toBe(200);
  const { suggestions } = await response.json();
  expect(suggestions).toEqual([
    ...(word ? [] : [{ kind: "headword", text: "op de hoogte houden" }]),
    { kind: "definition", text: "iemand blijven informeren" },
  ]);
});

it.each(["find-meaning", "draft-from-search"])("passes a validated card draft through the search route (%s)", async (intent) => {
  const suggestions = [
    { kind: "headword", text: "soeplepel" },
    { kind: "definition", text: "grote lepel om soep op te scheppen" },
  ];
  const response = await discover(["ladle"], { cardDraft: true, suggestions }, intent);
  const reply = await response.json();
  expect(reply).toMatchObject({ cardDraft: true, suggestions, sources: [{ entryId: "ladle" }] });
  const incomplete = await discover([], { cardDraft: true, suggestions: suggestions.slice(0, 1) }, intent);
  expect(await incomplete.json()).toMatchObject({ suggestions: [] });
});

it("binds an example replacement to the example present in the draft", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
    choices: [{ message: { content: JSON.stringify({
      message: "Here is a revision.",
      suggestions: [
        { kind: "example", text: "New second example", replaceExample: 2 },
        { kind: "example", text: "An invalid replacement", replaceExample: 3 },
      ],
    }) } }],
  })));
  const definition = "een lamp aan een muur";
  const response = await POST(new NextRequest("http://localhost/api/library/card-assistant", {
    method: "POST",
    body: JSON.stringify({
      word: "wandlamp", definition, question: "Replace the second example",
      languageCode: "nl", interfaceLanguage: "en",
      article: { senses: [{ definition, fields: [
        { kind: "example", text: "First example" },
        { kind: "note", text: "A note between examples" },
        { kind: "example", text: "Second example" },
      ] }] },
    }),
  }));

  expect(await response.json()).toMatchObject({ suggestions: [
    { kind: "example", text: "New second example", replaces: { ordinal: 2, text: "Second example" } },
  ] });
});

it.each([
  ["find-meaning", "I can help you find a word or expression or explain its meaning. What would you like to look up?"],
  [undefined, "I can help with this card. Which word, meaning or example would you like to work on?"],
])("replies with a localized redirect when the model marks an off-topic request (%s)", async (intent, message) => {
  const provider = vi.fn().mockResolvedValue(Response.json({
    choices: [{ message: { content: JSON.stringify({
      outOfScope: true,
      message: "Here is how to solve the equation.",
      cardDraft: true,
      suggestions: [{ kind: "definition", text: "Unrelated text" }],
    }) } }],
  }));
  vi.stubGlobal("fetch", provider);
  const response = await POST(new NextRequest("http://localhost/api/library/card-assistant", {
    method: "POST",
    body: JSON.stringify({
      word: "Explain this equation",
      definition: "",
      question: "Solve 3x + 5 = 23.",
      languageCode: "nl",
      interfaceLanguage: "en",
      intent,
    }),
  }));

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ mode: "provider", outOfScope: true, message, suggestions: [] });
  expect(provider).toHaveBeenCalledTimes(1);
  expect(JSON.parse(provider.mock.calls[0][1].body)).not.toHaveProperty("tool_choice");
});
