import { useCallback } from "react";

export function useTrainingAudio() {
  const playAudio = useCallback(async (audioUrl?: string, wordLabel?: string) => {
    if (!audioUrl) {
      console.error("[Audio] Missing audio URL for:", wordLabel);
      return false;
    }

    try {
      await new Audio(audioUrl).play();
      return true;
    } catch (err) {
      console.error("[Audio] Audio playback failed:", err);
      return false;
    }
  }, []);

  return { playAudio };
}
