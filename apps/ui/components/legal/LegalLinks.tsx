"use client";
import { createContext, useContext } from "react";
import { termsPath, privacyPath } from "@/lib/legal/serviceTerms";
import { localizedSection } from "@/lib/i18n/catalog";
import { useInterfaceLanguage } from "@/lib/i18n/useInterfaceLanguage";

export function useTermsCopy() {
  return localizedSection("serviceTerms")[useInterfaceLanguage()];
}

export const Managed = createContext(false);

export function LegalLinks() {
  const copy = useTermsCopy();
  if (!useContext(Managed)) return null;
  return <p className="text-sm"><a className="underline" href={termsPath} target="_blank" rel="noreferrer">{copy.terms}</a> · <a className="underline" href={privacyPath} target="_blank" rel="noreferrer">{copy.privacy}</a></p>;
}

