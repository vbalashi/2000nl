"use client";

import React from "react";
import { fetchPlatformV2LibraryGroup } from "@/lib/platform/platformV2LibraryClient";
import { usePlatformV2TranslationPreparation } from "@/lib/platform/usePlatformV2TranslationPreparation";
import type { PlatformSenseCardEntryV2 } from "../../../../../packages/shared/types/platformV2";
import { firstExactRenderableNodeTranslationV1 } from "../../../../../packages/shared/platform-v2/displayedTranslationArtifactIdentityV1";

const LanguagesContext = React.createContext<{primary: string | null; secondary: string | null; ownerId?:string}>({primary:null,secondary:null});
export function CardTranslationLanguagesProvider({primary,secondary,ownerId,children}:{primary:string|null;secondary:string|null;ownerId?:string;children:React.ReactNode}) {
  const active = (value:string|null) => value && value !== "off" ? value : null;
  return <LanguagesContext.Provider value={{primary:active(primary),secondary:active(primary) ? active(secondary) : null,ownerId}}>{children}</LanguagesContext.Provider>;
}
export function useAdditionalTranslationLanguage() {
  const {primary,secondary} = React.useContext(LanguagesContext);
  return secondary && secondary !== primary ? secondary : null;
}

type AdditionalTranslation = {
  language: string;
  labelPrimary: boolean;
  entry: PlatformSenseCardEntryV2 | null;
  status: "pending" | "failed" | null;
  retry: () => void;
};
const AdditionalContext = React.createContext<AdditionalTranslation | null>(null);
export function useAdditionalCardTranslation() { return React.useContext(AdditionalContext); }

/** A read-only dictionary projection. It never replaces the training question or capabilities. */
export function AdditionalCardTranslationProvider({entryId,contentLanguage,visible,preload=false,children}:{entryId:string;contentLanguage?:string;visible:boolean;preload?:boolean;children:React.ReactNode}) {
  const language = useAdditionalTranslationLanguage();
  const active = visible || preload;
  const {primary,ownerId} = React.useContext(LanguagesContext);
  const scope = JSON.stringify([ownerId,entryId,contentLanguage,language]);
  const [snapshot,setSnapshot] = React.useState<{scope:string;entry:PlatformSenseCardEntryV2|null;failed:boolean} | null>(null);
  const [lookupRetry,setLookupRetry] = React.useState(0);
  const current = snapshot?.scope === scope ? snapshot : null;
  const load = React.useCallback(async (signal:AbortSignal) => {
    if (!language) return null;
    const group = await fetchPlatformV2LibraryGroup({entryId,cardTypeId:"word-to-definition",contentLanguageCode:contentLanguage ?? "nl",translationTargetLanguageCode:language,signal});
    const entry = group?.entries.find((item):item is PlatformSenseCardEntryV2 => item.kind === "sense-card" && item.entryId === entryId) ?? null;
    if (!entry) throw new Error("additional_translation_entry_unavailable");
    if (!signal.aborted) setSnapshot({scope,entry,failed:false});
    return entry;
  }, [contentLanguage,entryId,language,scope]);
  React.useEffect(() => {
    if (!active || !language) return;
    const controller = new AbortController();
    void load(controller.signal).catch(() => {
      if (!controller.signal.aborted) setSnapshot(previous => ({scope,entry:previous?.scope === scope ? previous.entry : null,failed:true}));
    });
    return () => controller.abort();
  }, [active,language,load,lookupRetry,scope]);
  const preparation = usePlatformV2TranslationPreparation({entry:current?.entry ?? null,targetLanguageCode:language,enabled:active && !current?.failed,refresh:load});
  const retry = () => {
    if (current?.failed || !current?.entry) setLookupRetry(value => value + 1);
    else preparation.retry();
  };
  const needsPreparation = current?.entry?.capabilities.some(item => item.actionId === "request-translation" && item.targetLanguageCode === language);
  const status = current?.failed ? "failed" : preparation.status ?? (active && (!current?.entry || needsPreparation) ? "pending" : null);
  return <AdditionalContext.Provider value={language ? {language,labelPrimary:Boolean(primary),entry:current?.entry ?? null,status,retry} : null}>{children}</AdditionalContext.Provider>;
}

export function additionalTranslationText(context:AdditionalTranslation|null,key?:string,sourceTextFingerprint?:string,literal=false):string|undefined {
  if (!context || !key) return undefined;
  if (key === "entry") {
    const translation = context.entry?.translation;
    return translation?.isFresh && translation.status === "ready" && translation.targetLanguageCode === context.language
      ? [translation.text,...(translation.alternativeTexts ?? [])].filter(Boolean).join(" · ") : undefined;
  }
  const node = context.entry?.contentNodes.find(item => item.contentNodeId === key && (!sourceTextFingerprint || item.sourceTextFingerprint === sourceTextFingerprint));
  if (!node) return undefined;
  const translation = firstExactRenderableNodeTranslationV1(node.translations.filter(item => item.targetLanguageCode === context.language),node.sourceTextFingerprint);
  return literal ? translation?.literalText : translation?.text;
}
