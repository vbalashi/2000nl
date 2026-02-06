import { vi } from "vitest";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { NextRequest } from "next/server";

function getCacheKey(text: string): string {
  return crypto.createHash("sha256").update(text.trim()).digest("hex").slice(0, 16);
}

async function callTtsApi(text: string) {
  const { POST } = await import("../app/api/tts/route");
  const req = new NextRequest(
    new Request("http://localhost/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
  );
  return POST(req);
}

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const uiDir = path.resolve(testsDir, "..");
const repoRoot = path.resolve(uiDir, "..", "..");
const publicTtsDir = path.join(uiDir, "public", "audio", "tts");

const originalCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const originalApiKey = process.env.GOOGLE_TTS_API_KEY;
const originalCacheDir = process.env.TTS_CACHE_DIR;

beforeEach(() => {
  // Ensure we never hit real external services in case cache resolution regresses.
  process.env.GOOGLE_APPLICATION_CREDENTIALS = "";
  process.env.GOOGLE_TTS_API_KEY = "";
  process.env.TTS_CACHE_DIR = undefined;
});

afterEach(async () => {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = originalCreds;
  process.env.GOOGLE_TTS_API_KEY = originalApiKey;
  process.env.TTS_CACHE_DIR = originalCacheDir;
  vi.resetModules();
});

test("resolves UI public dir when cwd is apps/ui", async () => {
  const { resolveUiPublicDir } = await import("../app/api/tts/route");
  expect(resolveUiPublicDir(uiDir)).toBe(path.join(uiDir, "public"));
});

test("resolves UI public dir when cwd is repo root", async () => {
  const { resolveUiPublicDir } = await import("../app/api/tts/route");
  expect(resolveUiPublicDir(repoRoot)).toBe(path.join(repoRoot, "apps", "ui", "public"));
});

test("TTS cache hit returns a /audio/tts URL for playback on localhost", async () => {
  process.env.TTS_CACHE_DIR = publicTtsDir;
  vi.resetModules();

  const text = "Dit is een testzin.";
  const cacheKey = getCacheKey(text);
  const filePath = path.join(publicTtsDir, `${cacheKey}.mp3`);
  await fs.mkdir(publicTtsDir, { recursive: true });
  await fs.writeFile(filePath, Buffer.from("mp3"));

  try {
    const res = await callTtsApi(text);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      url: `/audio/tts/${cacheKey}.mp3`,
      cached: true,
      cacheKey,
    });
  } finally {
    await fs.unlink(filePath).catch(() => {});
  }
});
