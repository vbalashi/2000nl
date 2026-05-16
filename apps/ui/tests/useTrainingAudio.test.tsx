import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  resolveTrainingAudioUrl,
  useTrainingAudio,
} from "@/lib/training/useTrainingAudio";

const audioLoad = vi.fn();
const audioPlay = vi.fn(() => Promise.resolve());
const audioConstructor = vi.fn().mockImplementation(() => ({
  load: audioLoad,
  play: audioPlay,
  preload: "",
}));

describe("useTrainingAudio", () => {
  beforeEach(() => {
    vi.stubGlobal("Audio", audioConstructor);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ url: "/api/tts?key=abc" }),
      })),
    );
    window.localStorage.clear();
    audioConstructor.mockClear();
    audioLoad.mockClear();
    audioPlay.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("resolves direct and base-prefixed audio URLs", () => {
    expect(
      resolveTrainingAudioUrl({ audio_links: { nl: "https://cdn/audio.mp3" } }),
    ).toBe("https://cdn/audio.mp3");

    vi.stubEnv("NEXT_PUBLIC_AUDIO_BASE_URL", "https://audio.example/base/");

    expect(resolveTrainingAudioUrl({ audio_links: { nl: "/huis.mp3" } })).toBe(
      "https://audio.example/base/huis.mp3",
    );
    expect(resolveTrainingAudioUrl({ audio_links: { nl: "huis.mp3" } })).toBe(
      "https://audio.example/base/huis.mp3",
    );
    expect(resolveTrainingAudioUrl({})).toBeUndefined();
  });

  test("persists audio mode locally and preloads word audio", async () => {
    window.localStorage.setItem("audioModeEnabled", "true");

    const { result } = renderHook(() => useTrainingAudio("premium"));

    expect(result.current.audioModeEnabled).toBe(true);
    await waitFor(() =>
      expect(window.localStorage.getItem("audioModeEnabled")).toBe("true"),
    );

    act(() => {
      result.current.setAudioModeEnabled(false);
    });

    await waitFor(() =>
      expect(window.localStorage.getItem("audioModeEnabled")).toBe("false"),
    );

    act(() => {
      result.current.preloadAudioForWord({
        id: "word-1",
        headword: "huis",
        raw: { audio_links: { nl: "/huis.mp3" } },
      } as any);
    });

    expect(audioConstructor).toHaveBeenCalledWith("/huis.mp3");
    expect(audioLoad).toHaveBeenCalled();
  });

  test("playSentenceTTS sends quality and plays returned audio", async () => {
    const { result } = renderHook(() => useTrainingAudio("premium"));

    await act(async () => {
      await result.current.playSentenceTTS("  Dit is een zin.  ");
    });

    expect(fetch).toHaveBeenCalledWith("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Dit is een zin.",
        quality: "premium",
      }),
    });
    expect(audioConstructor).toHaveBeenCalledWith("/api/tts?key=abc");
    expect(audioPlay).toHaveBeenCalled();
    expect(result.current.ttsLoading).toBe(false);
  });
});
