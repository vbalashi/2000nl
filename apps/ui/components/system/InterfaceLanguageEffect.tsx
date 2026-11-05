"use client";
import { useEffect } from "react";
import { useInterfaceLanguage } from "@/lib/i18n/useInterfaceLanguage";
import { interfaceDirection } from "@/lib/i18n/registry";

export function InterfaceLanguageEffect() {
  const language = useInterfaceLanguage();
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = interfaceDirection(language);
  }, [language]);
  return null;
}
