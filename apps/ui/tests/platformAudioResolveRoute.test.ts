import { describe, expect, test } from "vitest";
import { NextRequest } from "next/server";
import { publicAudioAssetUrl } from "@/lib/platform/audioAssetUrl";

describe("platform audio resolve asset URLs", () => {
  test("uses forwarded public host for relative TTS cache URLs", () => {
    const request = new NextRequest(
      "http://0.0.0.0:3000/api/platform/v1/audio/resolve",
      {
        headers: {
          "x-forwarded-host": "2000.dilum.io",
          "x-forwarded-proto": "https",
        },
      },
    );

    expect(publicAudioAssetUrl(request, "/api/tts?key=f1a5c2eaa5ce435e")).toBe(
      "https://2000.dilum.io/api/tts?key=f1a5c2eaa5ce435e",
    );
  });

  test("rewrites internal absolute TTS URLs to the public origin", () => {
    const request = new NextRequest(
      "http://0.0.0.0:3000/api/platform/v1/audio/resolve",
      {
        headers: {
          host: "2000.dilum.io",
          "x-forwarded-proto": "https",
        },
      },
    );

    expect(publicAudioAssetUrl(request, "http://0.0.0.0:3000/api/tts?key=abc")).toBe(
      "https://2000.dilum.io/api/tts?key=abc",
    );
  });

  test("preserves external absolute URLs", () => {
    const request = new NextRequest("http://localhost:3000/api/platform/v1/audio/resolve");

    expect(publicAudioAssetUrl(request, "https://cdn.example/audio.mp3")).toBe(
      "https://cdn.example/audio.mp3",
    );
  });
});
