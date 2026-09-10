import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTrainingAudio } from "@/lib/training/useTrainingAudio";

const audioPlay = vi.fn(() => Promise.resolve());
const audioConstructor = vi.fn().mockImplementation(() => ({
  play: audioPlay,
}));

describe("useTrainingAudio", () => {
  beforeEach(() => {
    vi.stubGlobal("Audio", audioConstructor);
    audioConstructor.mockClear();
    audioPlay.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("plays a resolved V2 audio URL", () => {
    const { result } = renderHook(() => useTrainingAudio());

    act(() => {
      result.current.playAudio("https://audio.example/huis.mp3", "huis");
    });

    expect(audioConstructor).toHaveBeenCalledWith(
      "https://audio.example/huis.mp3",
    );
    expect(audioPlay).toHaveBeenCalledOnce();
  });

  test("reports a missing audio URL without constructing audio", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { result } = renderHook(() => useTrainingAudio());

    act(() => {
      result.current.playAudio(undefined, "huis");
    });

    expect(audioConstructor).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      "[Audio] Missing audio URL for:",
      "huis",
    );
  });

  test("reports playback failures", async () => {
    const failure = new Error("blocked");
    audioPlay.mockRejectedValueOnce(failure);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { result } = renderHook(() => useTrainingAudio());

    act(() => {
      result.current.playAudio("https://audio.example/huis.mp3", "huis");
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(consoleError).toHaveBeenCalledWith(
      "[Audio] Audio playback failed:",
      failure,
    );
  });

  test("has no retired toggle, preload, or sentence-TTS side effect", () => {
    window.localStorage.clear();
    const { result } = renderHook(() => useTrainingAudio());

    expect(result.current).toEqual({ playAudio: expect.any(Function) });
    expect(window.localStorage.getItem("audioModeEnabled")).toBeNull();
  });
});
