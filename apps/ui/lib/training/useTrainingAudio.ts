import { useCallback, useEffect, useState } from "react";
import type { AudioQuality } from "@/lib/audio/types";
import { trainingDebug } from "@/lib/trainingDebug";
import type { TrainingWord } from "@/lib/types";

export function resolveTrainingAudioUrl(
  raw?: TrainingWord["raw"] | null,
): string | undefined {
  if (!raw) return undefined;
  // Dutch (nl) pronunciation only for MVP - no fallback to Belgian (be)
  const link = raw.audio_links?.nl;
  if (!link) return undefined;

  if (/^https?:\/\//i.test(link)) return link;

  const baseUrl = process.env.NEXT_PUBLIC_AUDIO_BASE_URL?.replace(/\/$/, "");
  if (!baseUrl) return link;

  return link.startsWith("/") ? `${baseUrl}${link}` : `${baseUrl}/${link}`;
}

export function useTrainingAudio(audioQuality: AudioQuality) {
  const [audioModeEnabled, setAudioModeEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("audioModeEnabled") === "true";
    } catch {
      return false;
    }
  });
  const [ttsLoading, setTtsLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        "audioModeEnabled",
        audioModeEnabled.toString(),
      );
    } catch {
      // Ignore storage errors (e.g. tests without localStorage support).
    }
  }, [audioModeEnabled]);

  const resolveAudioUrl = useCallback(resolveTrainingAudioUrl, []);

  const preloadAudioForWord = useCallback(
    (word: TrainingWord) => {
      if (typeof window === "undefined") return;
      if (typeof Audio === "undefined") return;
      const url = resolveAudioUrl(word.raw);
      if (!url) return;

      try {
        const audio = new Audio(url);
        audio.preload = "auto";
        audio.load();
      } catch {
        // Ignore preload errors (e.g. tests, restricted environments).
      }
    },
    [resolveAudioUrl],
  );

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

  const playSentenceTTS = useCallback(
    async (sentence: string) => {
      if (!sentence.trim()) {
        console.error("[TTS] Empty sentence");
        return;
      }

      setTtsLoading(true);
      try {
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: sentence.trim(),
            quality: audioQuality,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          console.error("[TTS] API error:", error);

          if (!error.configured) {
            trainingDebug.log(
              "[TTS] Google TTS is not configured. Sentence pronunciation unavailable.",
            );
          }
          return;
        }

        const data = await response.json();
        if (data.url) {
          playAudio(data.url, sentence.slice(0, 50));
        }
      } catch (err) {
        console.error("[TTS] Request failed:", err);
      } finally {
        setTtsLoading(false);
      }
    },
    [audioQuality, playAudio],
  );

  return {
    audioModeEnabled,
    playAudio,
    playSentenceTTS,
    preloadAudioForWord,
    resolveAudioUrl,
    setAudioModeEnabled,
    ttsLoading,
  };
}
