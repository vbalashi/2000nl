import { NextRequest, NextResponse } from "next/server";
import {
  hasConfiguredPremiumTtsProvider,
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

  const audio = await readCachedAudio(key);
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
  try {
    const body = await req.json();
    const text = body.text as string | undefined;
    const qualityRaw = body.quality as unknown;

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json(
        { error: "Missing or invalid 'text' parameter" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const trimmedText = text.trim();
    const artifact = await resolveTtsAudio({ text: trimmedText, quality: qualityRaw });

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
  } catch (err: any) {
    const message = String(err?.message ?? err ?? "Unknown error");
    console.error("[TTS API] Error:", message);

    if (message === "invalid_audio_quality") {
      return NextResponse.json(
        { error: "Invalid 'quality' parameter (expected 'free' or 'premium')" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      {
        error: message,
        configured: hasConfiguredPremiumTtsProvider(),
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
