import { readBoundedJson } from "@/lib/http/readBoundedJson";
import { consumeAudioRateLimit } from "@/lib/audio/audioRateLimit";
import { assistantFeedbackAnswerLimit, assistantFeedbackHistoryLimit, assistantFeedbackQuestionLimit, assistantFeedbackReasons } from "@/lib/platform/assistantFeedbackContract";
import { readAssistantFeedbackRef } from "@/lib/platform/assistantFeedbackRef";
import { getAuthenticatedSupabase, getPlatformServiceSupabase, jsonNoStore } from "@/lib/platform/serverSupabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value: unknown, max: number) {
  return typeof value === "string" && value.length <= max ? value.trim() || null : null;
}

function readHistory(value: unknown) {
  if (!Array.isArray(value) || !value.length || value.length > assistantFeedbackHistoryLimit) return null;
  const exchanges = [];
  for (const exchange of value) {
    const question = text(exchange?.question, assistantFeedbackQuestionLimit);
    const answer = text(exchange?.answer, assistantFeedbackAnswerLimit);
    if (!question || !answer) return null;
    exchanges.push({ question, answer });
  }
  return exchanges;
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) return auth;
  if (auth.principal.authKind !== "first_party") return jsonNoStore({ error: "first_party_required" }, 403);
  const account = auth.principal.userId;
  const rate = consumeAudioRateLimit("assistant-feedback:" + account);
  if (!rate.allowed) return jsonNoStore({ error: "rate_limited" }, 429);

  const parsed = await readBoundedJson(request, 384 * 1024);
  if ("error" in parsed || !parsed.body || typeof parsed.body !== "object") {
    return jsonNoStore({ error: "invalid_feedback" }, 400);
  }
  const input = parsed.body as Record<string, unknown>;
  const reply = readAssistantFeedbackRef(account, input.replyRef);
  const { vote } = input;
  if (!reply || (vote !== "up" && vote !== "down")) return jsonNoStore({ error: "invalid_feedback" }, 400);

  const reasons: readonly string[] = assistantFeedbackReasons[reply.journey];
  const reason = vote === "down" && typeof input.reason === "string" && reasons.includes(input.reason) ? input.reason : null;
  const comment = vote === "down" ? text(input.comment, 1000) : null;
  const includeHistory = vote === "down" && input.includeHistory === true;
  const history = includeHistory ? readHistory(input.history) : null;
  if (includeHistory && !history) return jsonNoStore({ error: "invalid_history" }, 400);

  const service = getPlatformServiceSupabase();
  if (service instanceof Response) return service;
  const { error } = await service.supabase.from("assistant_reply_feedback").upsert({
    reply_id: reply.id, user_id: account, journey: reply.journey, language_code: reply.language,
    vote, reason, comment, chat_history: history, excerpt_question: null, excerpt_answer: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "reply_id" });
  return error ? jsonNoStore({ error: "feedback_unavailable" }, 503) : jsonNoStore({ saved: true });
}
