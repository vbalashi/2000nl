import { readAssistantAccess, requireAssistantAccess } from "@/lib/platform/assistantAccess";
import { NextRequest } from "next/server";
import { readBoundedJson } from "@/lib/http/readBoundedJson";
import {
  getPlatformServiceSupabase,
  jsonNoStore,
} from "@/lib/platform/serverSupabase";
import { loadPromptText } from "@/lib/translation/prompts/promptLoader";
import { loadTranslationConfigFromEnv } from "@/lib/translation/translationProvider";
import {
  assistantLabels,
  kinds,
  type AssistantReply,
  type SourceHit,
  type AssistantTurn,
  type Suggestion,
} from "@/lib/platform/personalCardAssistantContract";
import { VOCABULARY_PARTS } from "@/lib/vocabulary/partsOfSpeech";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
function bounded(value: unknown, max: number) {
  return typeof value === "string" && value.length <= max ? value.trim() : null;
}
function extract(value: unknown, allowHeadword: boolean, examples: string[]): Suggestion[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).flatMap((item) => {
    const { kind, text, replaceExample } = record(item),
      trimmed = bounded(text, kind === "headword" ? 300 : 1500);
    if (!trimmed || !kinds.includes(kind as Suggestion["kind"])) return [];
    if (kind === "headword" && (!allowHeadword || /[\r\n\u2028\u2029]/.test(trimmed))) return [];
    if (
      kind === "partOfSpeech" &&
      !VOCABULARY_PARTS.some((item) => item.code === trimmed)
    )
      return [];
    const suggestion: Suggestion = { kind: kind as Suggestion["kind"], text: trimmed };
    if (kind === "example" && replaceExample !== undefined) {
      if (typeof replaceExample !== "number" || !Number.isInteger(replaceExample) || !examples[replaceExample - 1]) return [];
      suggestion.replaces = { ordinal: replaceExample, text: examples[replaceExample - 1] };
    }
    return [suggestion];
  });
}
function sourcesForMatches(matches: unknown, candidates: SourceHit[]): SourceHit[] {
  if (!Array.isArray(matches)) return [];
  const sourcesById = new Map(candidates.map((hit) => [hit.entryId, hit]));
  return [...new Set(matches)]
    .flatMap((id) => sourcesById.get(id) ?? [])
    .slice(0, 8);
}
function readArticle(raw: unknown) {
  const input = record(raw);
  if (
    !Array.isArray(input.senses) ||
    input.senses.length < 1 ||
    input.senses.length > 50
  )
    return null;
  const senses = [];
  for (const item of input.senses) {
    const sense = record(item),
      definition = bounded(sense.definition, 8000);
    if (
      definition === null ||
      !Array.isArray(sense.fields) ||
      sense.fields.length > 100
    )
      return null;
    const fields = [];
    for (const data of sense.fields) {
      const field = record(data),
        text = bounded(field.text, 8000);
      if (
        text === null ||
        !["example", "note", "synonym", "expression", "reference"].includes(
          String(field.kind),
        )
      )
        return null;
      const children = [];
      if (field.children !== undefined) {
        if (
          field.kind !== "expression" ||
          !Array.isArray(field.children) ||
          field.children.length > 100
        )
          return null;
        for (const child of field.children) {
          const entry = record(child),
            text = bounded(entry.text, 8000);
          if (
            text === null ||
            !["explanation", "example"].includes(String(entry.kind))
          )
            return null;
          children.push({ kind: String(entry.kind), text });
        }
      }
      fields.push({ kind: String(field.kind), text, children });
    }
    senses.push({ definition, fields });
  }
  return {
    kind: input.kind === "expression" ? "expression" : "word",
    nounArticle: input.nounArticle === "de" || input.nounArticle === "het" ? input.nounArticle : null,
    partOfSpeech: bounded(input.partOfSpeech, 30),
    senses,
  };
}
export async function POST(request: NextRequest) {
  const auth = await requireAssistantAccess(request);
  if (auth instanceof Response) return auth;
  const parsed = await readBoundedJson(request, 320 * 1024);
  if ("error" in parsed) return jsonNoStore({ error: "invalid_request" }, 400);
  const body = record(parsed.body),
    word = bounded(body.word, 300),
    definition = bounded(body.definition, 8000),
    question = bounded(body.question, 1500),
    language = bounded(body.languageCode, 20),
    locale = bounded(body.interfaceLanguage, 20);
  if (
    word === null ||
    definition === null ||
    !question ||
    !language ||
    !locale ||
    !/^[a-z]{2,3}(-[a-zA-Z]+)?$/.test(language)
  )
    return jsonNoStore({ error: "invalid_context" }, 400);
  const article = readArticle(
    body.article ?? {
      partOfSpeech: null,
      senses: [{ definition, fields: [] }],
    },
  );
  const selectedOrdinal = body.selectedOrdinal ?? 1;
  if (
    !article ||
    typeof selectedOrdinal !== "number" ||
    !Number.isInteger(selectedOrdinal) ||
    selectedOrdinal < 1 ||
    selectedOrdinal > article.senses.length ||
    article.senses[selectedOrdinal - 1].definition.trim() !== definition
  )
    return jsonNoStore({ error: "invalid_article" }, 400);
  const history: AssistantTurn[] = [];
  if (Array.isArray(body.history))
    for (const t of body.history.slice(-8)) {
      const { role, text } = record(t);
      if ((role === "user" || role === "assistant") && typeof text === "string")
        history.push({ role, text: text.slice(0, 1500) });
    }
  // Russian questions can contain long Dutch quotes. Give the model an explicit
  // language hint when the learner uses common Russian question or request words.
  const russianRequest = /(?:^|[^\p{L}])(?:что|это|как|чем|почему|можно|слово|значит|объясни|объясните|сравни|предложи|помоги|напиши|русском|расскажи|дай|хочу|пожалуйста|добавь|переведи)(?=$|[^\p{L}])/iu;
  const lastFreeQuestion = body.intent && body.intent !== "find-meaning" && body.intent !== "draft-from-search"
    ? history.filter(turn => turn.role === "user").at(-1)?.text
    : question;
  const replyLanguageHint = lastFreeQuestion && russianRequest.test(lastFreeQuestion)
    ? "Russian (ru)" : undefined;
  const labels = assistantLabels(replyLanguageHint ? "ru" : locale),
    config = loadTranslationConfigFromEnv(),
    apiKey = config.apiKeys.openai;
  const similar = body.intent === "similar",
    compare = body.intent === "compare";
  const draftFromSearch = body.intent === "draft-from-search";
  const discovery = body.intent === "find-meaning" || draftFromSearch;
  const originalGroup = body.searchCategory === "examples" || body.searchCategory === "definitions" ? body.searchCategory : "headwords";
  const search = body.intent === "search" || similar;
  const accountId = auth.principal.userId;
  async function lookup(
    query: string,
    group: "definitions" | "headwords" | "examples",
    exact: boolean,
  ): Promise<SourceHit[] | Response> {
    const service = getPlatformServiceSupabase();
    if (service instanceof Response) return service;
    const { data, error } = await service.supabase
      .rpc("search_library_category_v1", {
        p_user_id: accountId,
        p_query: query,
        p_language_code: language,
        p_dictionary_ids: null,
        p_filters: { parts: [], article: null },
        p_material: null,
        p_group: group,
        p_limit: 6,
        p_cursor: null,
      })
      .abortSignal(request.signal);
    if (error || data?.error)
      return jsonNoStore({ error: "search_failed" }, 502);
    const matches: SourceHit[] = [];
    for (const hit of data?.groups?.[0]?.items ?? []) {
      const candidate = bounded(
        hit.entry?.summaryDefinition ?? hit.field?.text,
        8000,
      );
      const entryId = hit.entry?.id,
        dictionaryId = hit.dictionary?.id,
        dictionary = bounded(hit.dictionary?.name, 300),
        headword = bounded(hit.entry?.headword, 300);
      if (
        candidate &&
        headword &&
        dictionary &&
        typeof dictionaryId === "string" &&
        typeof entryId === "string" &&
        (!exact ||
          headword.toLocaleLowerCase() === query.toLocaleLowerCase()) &&
        !matches.some((r) => r.entryId === entryId)
      ) {
        matches.push({
          entryId,
          dictionaryId,
          dictionary,
          word: headword,
          definition: candidate,
          ...(group === "examples" && hit.field?.text ? {example:String(hit.field.text).slice(0,1500)} : {}),
        });
      }
    }
    return matches;
  }
  const originalHits = discovery ? await lookup(word, originalGroup, false) : [];
  if (originalHits instanceof Response) return originalHits;
  if (discovery && !apiKey) {
    return jsonNoStore({mode:"dictionary", message:originalHits.length ? labels.results : labels.none, sources:originalHits, suggestions:[]});
  }
  if (search || !apiKey) {
    if (compare && !apiKey)
      return jsonNoStore({
        mode: "preview",
        message: labels.noCompare,
        suggestions: [],
      });
    const references = word ? await lookup(word, "headwords", !similar) : [];
    if (references instanceof Response) return references;
    if (similar && definition) {
      // Short, distinctive tokens also find articles filed under another spelling.
      const terms = [
        ...new Set(definition.toLocaleLowerCase().match(/\p{L}{4,}/gu) ?? []),
      ]
        .sort((a, b) => b.length - a.length)
        .slice(0, 3);
      const pages = await Promise.all(
        terms.map((term) => lookup(term, "definitions", false)),
      );
      for (const hits of pages) {
        if (hits instanceof Response) return hits;
        for (const hit of hits)
          if (!references.some((r) => r.entryId === hit.entryId))
            references.push(hit);
      }
    }
    let response: AssistantReply = {
      mode: "dictionary",
      message: references.length ? labels.results : labels.none,
      sources: references.slice(0, 10),
      suggestions: similar
        ? []
        : references
            .slice(0, 6)
            .map((hit) => ({ kind: "definition", text: hit.definition })),
    };
    if (!search && language === "nl" && word.toLowerCase() === "baan") {
      const fabric = /stof|papier|strook|behang/i.test(definition);
      const suggestions: Suggestion[] = [
        {
          kind: "definition",
          text: fabric
            ? "een lang stuk stof of papier"
            : "werk dat je voor een werkgever doet",
        },
        {
          kind: "example",
          text: fabric
            ? "Voor het gordijn heb ik twee banen stof nodig."
            : "Mijn zus zoekt een baan in Utrecht.",
        },
        { kind: "partOfSpeech", text: "zn" },
      ];
      response = { mode: "preview", message: labels.sample, suggestions };
    }
    return jsonNoStore(response);
  }
  const configured =
    config.apiUrls?.openai || "https://api.openai.com/v1/chat/completions";
  const endpoint = /\/v1\/?$/.test(configured)
    ? configured.replace(/\/$/, "") + "/chat/completions"
    : configured;
  let instructions: string;
  try {
    instructions = loadPromptText(discovery ? "personal_card_search_v1.txt" : "personal_card_editor_v1.txt")
      .trim()
      .replace("{{partOfSpeechCodes}}", VOCABULARY_PARTS.map(part => part.code).join(", "));
  } catch {
    return jsonNoStore({ error: "assistant_unavailable" }, 503);
  }
  const messages: Record<string, unknown>[] = [
    {
      role: "system",
      content: instructions,
    },
    ...history.map((t) => ({ role: t.role, content: t.text })),
    {
      role: "user",
      content: JSON.stringify({
        word,
        ...(discovery ? {searchCategory:originalGroup,originalHits,scope:bounded(body.searchScope,250)} : {article,selectedOrdinal}),
        intent: compare ? "compare-all-meanings" : body.intent,
        definition,
        language,
        interfaceLanguage: locale,
        replyLanguageHint,
      }),
    },
    { role: "user", content: question },
  ];
  const deadline = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(45000),
  ]);
  async function complete(allowLookup: boolean) {
    return fetch(endpoint, {
      method: "POST",
      cache: "no-store",
      signal: deadline,
      headers: {
        "Content-Type": "application/json",
        ...(/\.openai\.azure\.com/i.test(endpoint)
          ? { "api-key": apiKey! }
          : { Authorization: "Bearer " + apiKey }),
      },
      body: JSON.stringify({
        model: config.models?.openai ?? "gpt-5.2",
        ...(/^gpt-6/i.test(config.models?.openai ?? "")
          ? { reasoning_effort: "none" }
          : {}),
        messages,
        response_format: { type: "json_object" },
        max_completion_tokens: 1800,
        ...(allowLookup
          ? {
              tools: [
                {
                  type: "function",
                  function: {
                    name: "search_library",
                    description:
                      "Search accessible dictionary articles in the learning language. Choose headwords for spelling or lemmas, definitions for meaning, or examples for phrase usage when offered.",
                    parameters: {
                      type: "object",
                      properties: {
                        query: { type: "string" },
                        group: {
                          type: "string",
                          enum: discovery ? ["definitions","headwords","examples"] : ["definitions", "headwords"],
                        },
                      },
                      required: ["query"],
                      additionalProperties: false,
                    },
                  },
                },
              ],
              ...(discovery && !messages.some(message=>message.role==="tool") ? {tool_choice:{type:"function",function:{name:"search_library"}}} : {}),
              parallel_tool_calls: false,
            }
          : {}),
      }),
    });
  }
  try {
    let res = await complete(true);
    if (!res.ok) return jsonNoStore({ error: "provider_failed" }, 502);
    let searched = false;
    let sources: SourceHit[] = [...originalHits];
    let answer = (await res.json()).choices?.[0]?.message;
    for (let attempt=0; answer?.tool_calls?.length && attempt<(discovery ? 3 : 1); attempt++) {
      const calls = answer.tool_calls;
      if (
        calls.length !== 1 ||
        calls[0]?.function?.name !== "search_library" ||
        typeof calls[0].id !== "string"
      )
        return jsonNoStore({ error: "invalid_tool_call" }, 502);
      const query = bounded(
        record(JSON.parse(calls[0].function.arguments)).query,
        200,
      );
      if (!query) return jsonNoStore({ error: "invalid_search_query" }, 502);
      const requestedGroup = record(JSON.parse(calls[0].function.arguments)).group;
      const group = requestedGroup === "definitions" || (discovery && requestedGroup === "examples") ? requestedGroup : "headwords";
      const hits = await lookup(query, group, false);
      searched = true;
      if (hits instanceof Response) return hits;
      sources.push(...hits.filter(hit=>!sources.some(source=>source.entryId===hit.entryId)));
      messages.push(
        { role: "assistant", content: null, tool_calls: calls },
        {
          role: "tool",
          tool_call_id: calls[0].id,
          content: JSON.stringify({
            query,
            hits: hits.map(({ dictionary, word, definition, example, entryId }) => ({
              entryId,
              dictionary,
              headword: word,
              example,
              definition,
            })),
          }),
        },
      );
      res = await complete(discovery && attempt < 2);
      if (!res.ok) return jsonNoStore({ error: "provider_failed" }, 502);
      answer = (await res.json()).choices?.[0]?.message;
    }
    const reply = record(JSON.parse(answer.content)),
      message = bounded(reply.message, 6000);
    if (!message || (discovery && !Array.isArray(reply.matches)))
      return jsonNoStore({ error: "invalid_answer" }, 502);
    const examples = article.senses[selectedOrdinal - 1].fields
      .filter((field) => field.kind === "example").map((field) => field.text);
    const suggestions = compare || (discovery && reply.cardDraft !== true)
      ? []
      : extract(reply.suggestions, discovery || !word, examples);
    const cardDraft = discovery
      && suggestions.some(item => item.kind === "headword")
      && suggestions.some(item => item.kind === "definition");
    return jsonNoStore({
      mode: "provider",
      message,
      searched,
      sources: discovery
        ? sourcesForMatches(reply.matches, sources)
        : sources,
      ...(cardDraft ? { cardDraft: true } : {}),
      suggestions: discovery && !cardDraft ? [] : suggestions,
    });
  } catch (error) {
    return jsonNoStore(
      {
        error:
          error instanceof SyntaxError
            ? "invalid_provider_json"
            : error instanceof TypeError
              ? "provider_transport_failed"
              : "provider_unavailable",
      },
      502,
    );
  }
}

export async function GET(request: NextRequest) {
  const access = await readAssistantAccess(request);
  if (access instanceof Response) return access;
  return jsonNoStore({ allowed: access.allowed, userId: access.auth.user.id });
}
