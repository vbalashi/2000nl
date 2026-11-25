"use client";
import { useState } from "react";
import { Volume2 } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import { SenseCardHeaderAction } from "../SenseCardChrome";

export function DraftWordAudio({word,languageCode,locale}:{
  word:string; languageCode:string; locale:OnboardingLanguage;
}) {
  const available = typeof window !== "undefined" && "speechSynthesis" in window;
  const [failedWord, setFailedWord] = useState<string | null>(null);
  return <><SenseCardHeaderAction label={platformV2Message(locale,"senseCard.audio.play")}
    disabled={!word.trim() || !available} onClick={() => {
      const speech = new SpeechSynthesisUtterance(word.trim());
      speech.lang = languageCode;
      setFailedWord(null);
      speech.onerror = event => {
        if (!["canceled","interrupted"].includes(event.error)) setFailedWord(word);
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(speech);
    }}><Volume2 size={16} aria-hidden="true"/></SenseCardHeaderAction>
    {failedWord === word && <small role="alert">{platformV2Message(locale,"senseCard.audio.failed")}</small>}
  </>;
}
