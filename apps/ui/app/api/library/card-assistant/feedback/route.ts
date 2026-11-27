import { readBoundedJson } from "@/lib/http/readBoundedJson";
import { consumeAudioRateLimit } from "@/lib/audio/audioRateLimit";
import { assistantFeedbackReasons } from "@/lib/platform/assistantFeedbackContract";
import { readAssistantFeedbackRef } from "@/lib/platform/assistantFeedbackRef";
import { getAuthenticatedSupabase, getPlatformServiceSupabase, jsonNoStore } from "@/lib/platform/serverSupabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value: unknown, max: number) {
  return typeof value === "string" && value.length <= max ? value.trim() || null : null;
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) return auth;
  if (auth.principal.authKind !== "first_party") return jsonNoStore({ error: "first_party_required" }, 403);
  const account = auth.principal.userId;
  const rate = consumeAudioRateLimit("assistant-feedback:" + account);
  if (!rate.allowed) return jsonNoStore({ error: "rate_limited" }, 429);

  const parsed = await readBoundedJson(request, 64 * 1024);
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
  const includeExcerpt = vote === "down" && input.includeExcerpt === true;
  const question = includeExcerpt ? text(input.question, 1500) : null;
  const answer = includeExcerpt ? text(input.answer, 6000) : null;
  if (includeExcerpt && (!question || !answer)) return jsonNoStore({ error: "invalid_excerpt" }, 400);

  const service = getPlatformServiceSupabase();
  if (service instanceof Response) return service;
  const { error } = await service.supabase.from("assistant_reply_feedback").upsert({
    reply_id: reply.id, user_id: account, journey: reply.journey, language_code: reply.language,
    vote, reason, comment, excerpt_question: question, excerpt_answer: answer,
    updated_at: new Date().toISOString(),
  }, { onConflict: "reply_id" });
  return error ? jsonNoStore({ error: "feedback_unavailable" }, 503) : jsonNoStore({ saved: true });
}
