import { NextRequest } from "next/server";
import {
  getAuthenticatedSupabase,
  jsonNoStore,
  requirePlatformScope,
} from "@/lib/platform/serverSupabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const sampleRate = 16000;
const maxBytes = 44 + 60 * sampleRate * 2;
/** Accept the canonical mono PCM layout produced by the recorder. */
function validWav(wav: Buffer) {
  return (
    wav.length >= 46 &&
    wav.length % 2 === 0 &&
    wav.toString("ascii", 0, 4) === "RIFF" &&
    wav.readUInt32LE(4) === wav.length - 8 &&
    wav.toString("ascii", 8, 16) === "WAVEfmt " &&
    wav.readUInt32LE(16) === 16 &&
    wav.readUInt16LE(20) === 1 &&
    wav.readUInt16LE(22) === 1 &&
    wav.readUInt32LE(24) === sampleRate &&
    wav.readUInt32LE(28) === sampleRate * 2 &&
    wav.readUInt16LE(32) === 2 &&
    wav.readUInt16LE(34) === 16 &&
    wav.toString("ascii", 36, 40) === "data" &&
    wav.readUInt32LE(40) === wav.length - 44
  );
}
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development")
    return jsonNoStore({ error: "not_available" }, 404);
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) return auth;
  if (auth.principal.authKind !== "first_party")
    return jsonNoStore({ error: "first_party_required" }, 403);
  const denied = requirePlatformScope(auth, "platform:read");
  if (denied) return denied;
  const key = process.env.AZURE_SPEECH_KEY,
    region = process.env.AZURE_SPEECH_REGION?.trim();
  if (!key || !region || !/^[a-z0-9]+$/.test(region))
    return jsonNoStore({ error: "dictation_unavailable" }, 503);
  if (request.headers.get("content-type")?.split(";")[0] !== "audio/wav")
    return jsonNoStore({ error: "unsupported_audio" }, 415);
  if (Number(request.headers.get("content-length")) > maxBytes)
    return jsonNoStore({ error: "recording_too_long" }, 413);
  const reader = request.body?.getReader();
  if (!reader) return jsonNoStore({ error: "missing_audio" }, 400);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > maxBytes) {
        await reader.cancel();
        return jsonNoStore({ error: "recording_too_long" }, 413);
      }
      chunks.push(value);
    }
  } catch {
    return jsonNoStore({ error: "invalid_audio" }, 400);
  } finally {
    reader.releaseLock();
  }
  const audio = Buffer.concat(chunks);
  if (!validWav(audio)) return jsonNoStore({ error: "invalid_audio" }, 400);
  try {
    const endpoint = new URL(
      "https://" +
        region +
        ".api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15",
    );
    const payload = new FormData();
    payload.append(
      "audio",
      new Blob([new Uint8Array(audio)], { type: "audio/wav" }),
      "dictation.wav",
    );
    // Enhanced transcription detects the spoken language from the audio, independently of UI language.
    payload.append(
      "definition",
      JSON.stringify({ enhancedMode: { enabled: true, task: "transcribe" } }),
    );
    const result = await fetch(endpoint, {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(30000)]),
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        Accept: "application/json",
      },
      body: payload,
    });
    if (!result.ok) return jsonNoStore({ error: "recognition_failed" }, 502);
    const data = await result.json();
    const text = Array.isArray(data.combinedPhrases)
      ? data.combinedPhrases
          .map((p: { text?: unknown }) =>
            typeof p.text === "string" ? p.text.trim() : "",
          )
          .filter(Boolean)
          .join(" ")
      : "";
    if (!text) return jsonNoStore({ error: "no_speech" }, 422);
    return jsonNoStore({ text });
  } catch {
    return jsonNoStore({ error: "recognition_failed" }, 502);
  }
}
