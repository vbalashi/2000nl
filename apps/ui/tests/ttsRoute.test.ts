import { vi } from "vitest";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { NextRequest } from "next/server";

function getCacheKey(params: {
  text: string;
  quality: "free" | "premium";
  providerId: "free" | "google" | "azure";
}): string {
  const input = `${params.quality}:${params.providerId}:${params.text.trim()}`;
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 16);
}

async function callTtsApi(text: string, quality?: "free" | "premium") {
  const { POST } = await import("../app/api/tts/route");
  const req = new NextRequest(
    new Request("http://localhost/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, quality }),
    })
  );
  return POST(req);
}

async function callTtsGet(cacheKey: string) {
  const { GET } = await import("../app/api/tts/route");
  const req = new NextRequest(
    new Request(`http://localhost/api/tts?key=${cacheKey}`, { method: "GET" })
  );
  return GET(req);
}

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const uiDir = path.resolve(testsDir, "..");
const repoRoot = path.resolve(uiDir, "..", "..");
const ttsCacheDir = path.join(repoRoot, "tmp", "tts-test-cache");

const originalCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const originalApiKey = process.env.GOOGLE_TTS_API_KEY;
const originalCacheDir = process.env.TTS_CACHE_DIR;
const originalPremiumProvider = process.env.PREMIUM_AUDIO_PROVIDER;
const originalAudioQualityDefault = process.env.AUDIO_QUALITY_DEFAULT;

beforeEach(() => {
  // Ensure we never hit real external services in case cache resolution regresses.
  process.env.GOOGLE_APPLICATION_CREDENTIALS = "";
  process.env.GOOGLE_TTS_API_KEY = "";
  process.env.TTS_CACHE_DIR = undefined;
  // Keep tests deterministic regardless of local env.
  process.env.AUDIO_QUALITY_DEFAULT = "free";
  process.env.PREMIUM_AUDIO_PROVIDER = "google";
});

afterEach(async () => {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = originalCreds;
  process.env.GOOGLE_TTS_API_KEY = originalApiKey;
  process.env.TTS_CACHE_DIR = originalCacheDir;
  process.env.PREMIUM_AUDIO_PROVIDER = originalPremiumProvider;
  process.env.AUDIO_QUALITY_DEFAULT = originalAudioQualityDefault;
  vi.resetModules();
});

test("resolves UI public dir when cwd is apps/ui", async () => {
  const { resolveUiPublicDir } = await import("../lib/resolveUiPublicDir");
  expect(resolveUiPublicDir(uiDir)).toBe(path.join(uiDir, "public"));
});

test("resolves UI public dir when cwd is repo root", async () => {
  const { resolveUiPublicDir } = await import("../lib/resolveUiPublicDir");
  expect(resolveUiPublicDir(repoRoot)).toBe(path.join(repoRoot, "apps", "ui", "public"));
});

test("TTS cache hit returns an /api/tts?key= URL for playback", async () => {
  process.env.TTS_CACHE_DIR = ttsCacheDir;
  vi.resetModules();

  const text = "Dit is een testzin.";
  const cacheKey = getCacheKey({ text, quality: "free", providerId: "free" });
  const filePath = path.join(ttsCacheDir, `${cacheKey}.mp3`);
  await fs.mkdir(ttsCacheDir, { recursive: true });
  await fs.writeFile(filePath, Buffer.from("mp3"));

  try {
    const res = await callTtsApi(text);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      url: `/api/tts?key=${cacheKey}`,
      cached: true,
      cacheKey,
    });

    const audioRes = await callTtsGet(cacheKey);
    expect(audioRes.status).toBe(200);
    expect(audioRes.headers.get("content-type")).toBe("audio/mpeg");
  } finally {
    await fs.unlink(filePath).catch(() => {});
  }
});

test("TTS cache key includes requested audio quality (free vs premium)", async () => {
  process.env.TTS_CACHE_DIR = ttsCacheDir;
  // Ensure consistent provider selection for premium cache key.
  process.env.PREMIUM_AUDIO_PROVIDER = "google";
  vi.resetModules();

  const text = "Dit is een testzin.";
  const freeKey = getCacheKey({ text, quality: "free", providerId: "free" });
  const premiumKey = getCacheKey({ text, quality: "premium", providerId: "google" });

  await fs.mkdir(ttsCacheDir, { recursive: true });
  const freePath = path.join(ttsCacheDir, `${freeKey}.mp3`);
  const premiumPath = path.join(ttsCacheDir, `${premiumKey}.mp3`);
  await fs.writeFile(freePath, Buffer.from("mp3-free"));
  await fs.writeFile(premiumPath, Buffer.from("mp3-premium"));

  try {
    const freeRes = await callTtsApi(text, "free");
    expect(freeRes.status).toBe(200);
    expect(await freeRes.json()).toMatchObject({
      url: `/api/tts?key=${freeKey}`,
      cached: true,
      cacheKey: freeKey,
    });

    const premiumRes = await callTtsApi(text, "premium");
    expect(premiumRes.status).toBe(200);
    expect(await premiumRes.json()).toMatchObject({
      url: `/api/tts?key=${premiumKey}`,
      cached: true,
      cacheKey: premiumKey,
    });
  } finally {
    await fs.unlink(freePath).catch(() => {});
    await fs.unlink(premiumPath).catch(() => {});
  }
});
