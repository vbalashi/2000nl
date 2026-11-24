import { recordProviderEvent } from "@/lib/providers/providerDiagnostics";
import { readProviderJson, providerErrorResponse } from "@/lib/providers/providerSafety";
import { getAuthenticatedSupabase, requirePlatformScope } from "@/lib/platform/serverSupabase";
import { NextRequest, NextResponse } from "next/server";
import {
  readCachedAudio,
  resolveTtsAudio,
} from "@/lib/audio/ttsCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");

  if (!key || !/^[0-9a-f]{16}$/.test(key)) {
    return NextResponse.json(
      { error: "Missing or invalid 'key' parameter" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  let audio: Buffer | null;
  try { audio = await readCachedAudio(key); } catch { return NextResponse.json({ error: "audio_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
  if (audio) {
    return new NextResponse(new Uint8Array(audio), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }
  return NextResponse.json(
    { error: "Not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedSupabase(req);
  if (auth instanceof Response) return auth;
  const scopeError = requirePlatformScope(auth, "platform:write");
  if (scopeError) return scopeError;
  try {
    const body = await readProviderJson(req, "audio");
    const text = body?.text as string | undefined;
    const qualityRaw = body?.quality as unknown;

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json(
        { error: "Missing or invalid 'text' parameter" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const trimmedText = text.trim();
    const artifact = await resolveTtsAudio({ text: trimmedText, quality: qualityRaw, accountId: auth.user.id });

    recordProviderEvent({ kind: "audio_resolution", source: artifact.cached ? "cache" : "generated", purpose: "resolve" });
    return NextResponse.json(
      {
        url: artifact.url,
        cached: artifact.cached,
        cacheKey: artifact.cacheKey,
        quality: artifact.quality,
        providerId: artifact.providerId,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_audio_quality") return NextResponse.json({ error: "invalid_audio_quality" }, { status: 400 });
    const failure = providerErrorResponse(error);
    return NextResponse.json(failure.payload, { status: failure.status, headers: { "Cache-Control": "no-store", ...(failure.payload.retryAfterMs ? { "Retry-After": String(Math.ceil(failure.payload.retryAfterMs / 1000)) } : {}) } });
  }
}
