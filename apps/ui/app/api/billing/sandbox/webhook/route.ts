import { getPlatformServiceSupabase, jsonNoStore } from "@/lib/platform/serverSupabase";
import { normalizePaddleSandboxEvent, readSandboxWebhookConfig, validPaddleSignature } from "@/lib/billing/paddleSandboxWebhook";

export const runtime = "nodejs";
const maxPayload = 128 * 1024;

async function readWebhookBody(request: Request): Promise<Uint8Array | null> {
  if (Number(request.headers.get("content-length")) > maxPayload) return null;
  const stream = request.body?.getReader();
  if (!stream) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await stream.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxPayload) {
        void stream.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } catch {
    return null;
  } finally {
    stream.releaseLock();
  }
}

export async function POST(request: Request) {
  const config = readSandboxWebhookConfig(process.env);
  if (!config) return jsonNoStore({ error: "sandbox_webhook_disabled" }, 404);
  const raw = await readWebhookBody(request);
  if (!raw) return jsonNoStore({ error: "invalid_webhook_body" }, 400);
  if (!validPaddleSignature(config.secret, request.headers.get("paddle-signature"), raw)) {
    return jsonNoStore({ error: "invalid_webhook_signature" }, 401);
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  } catch {
    return jsonNoStore({ error: "invalid_webhook_body" }, 400);
  }
  const event = normalizePaddleSandboxEvent(body, config.prices, config.allowSimulations);
  if (!event) return new Response(null, { status: 204 });

  const service = getPlatformServiceSupabase();
  if (service instanceof Response) return jsonNoStore({ error: "sandbox_inbox_unavailable" }, 503);
  try {
    const { error } = await service.supabase.rpc("record_paddle_sandbox_event", { p_event: event });
    if (error) return jsonNoStore({ error: "sandbox_inbox_unavailable" }, 503);
  } catch {
    return jsonNoStore({ error: "sandbox_inbox_unavailable" }, 503);
  }
  return new Response(null, { status: 204 });
}
