"use client";
import { useEffect, useState } from "react";
import { detectOnboardingLanguage, getStoredOnboardingLanguage, INTERFACE_LANGUAGE_EVENT } from "@/lib/onboardingI18n";
import { defaultInterfaceLanguage, isInterfaceLanguage, type InterfaceLanguage } from "./registry";

/** For app-level surfaces outside the account controller (offline banner, legacy controls). */
export function useInterfaceLanguage(): InterfaceLanguage {
  const [language, setLanguage] = useState(defaultInterfaceLanguage);
  useEffect(() => {
    const read = () => setLanguage(getStoredOnboardingLanguage() ?? detectOnboardingLanguage());
    const change = (event: Event) => {
      const value: unknown = (event as CustomEvent).detail;
      if (isInterfaceLanguage(value)) setLanguage(value);
    };
    read();
    window.addEventListener(INTERFACE_LANGUAGE_EVENT, change);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(INTERFACE_LANGUAGE_EVENT, change);
      window.removeEventListener("storage", read);
    };
  }, []);
  return language;
}
