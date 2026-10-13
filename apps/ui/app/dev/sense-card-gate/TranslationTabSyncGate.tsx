"use client";
import React from "react";
import {
  onDictionaryTranslationReady,
  onDictionaryTranslationRevalidate,
  publishDictionaryTranslationReady,
} from "@/lib/translation/dictionaryTranslationEvents";
export function TranslationTabSyncGate() {
  const [received, setReceived] = React.useState(0),
    [checked, setChecked] = React.useState(0);
  React.useEffect(() => {
    const detach = onDictionaryTranslationReady((event) => {
      if (
        event.entryId === "tab-sync-fixture" &&
        event.targetLanguageCode === "ru"
      )
        setReceived((n) => n + 1);
    });
    const recover = onDictionaryTranslationRevalidate(() =>
      setChecked((n) => n + 1),
    );
    return () => {
      detach();
      recover();
    };
  }, []);
  return (
    <main>
      <h1>Translation tab sync fixture</h1>
      <button
        onClick={() =>
          publishDictionaryTranslationReady({
            entryId: "tab-sync-fixture",
            targetLanguageCode: "ru",
          })
        }
      >
        Complete translation
      </button>
      <output data-testid="received">{received}</output>
      <output data-testid="checked">{checked}</output>
    </main>
  );
}
