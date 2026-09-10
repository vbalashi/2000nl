import { useCallback } from "react";

export function useTrainingAudio() {
  const playAudio = useCallback((audioUrl?: string, wordLabel?: string) => {
    if (!audioUrl) {
      console.error("[Audio] Missing audio URL for:", wordLabel);
      return;
    }

    const audio = new Audio(audioUrl);
    audio.play().catch((err) => {
      console.error("[Audio] Audio playback failed:", err);
    });
  }, []);

  return { playAudio };
}
