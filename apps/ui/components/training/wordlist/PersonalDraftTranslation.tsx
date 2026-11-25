"use client";
import React from "react";
import { translationRequestHeaders } from "@/lib/translation/translationApiClient";
import { ArticleTranslation } from "@/components/practice/article/ArticleContent";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";

export function PersonalDraftTranslation({
  word,
  definition,
  language,
  locale,
}: {
  word: string;
  definition: string;
  language: string;
  locale: OnboardingLanguage;
}) {
  const [value, setValue] = React.useState("");
  const [failed, setFailed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      try {
        const response = await fetch("/api/platform/translation", {
          method: "POST",
          headers: {
            ...(await translationRequestHeaders()),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            targetLang: language,
            item: {
              entry: {
                content: {
                  headword: word,
                  sections: [{ kind: "meaning", text: definition }],
                },
              },
            },
          }),
          signal: abort.signal,
        });
        const result = await response.json();
        if (abort.signal.aborted) return;
        if (response.ok && result.status === "pending") {
          timer = setTimeout(
            () => void load(),
            Math.max(1000, result.retryAfterMs || 2000),
          );
          return;
        }
        const text = result.overlay?.meanings?.[0]?.definition;
        if (!response.ok || typeof text !== "string" || !text.trim())
          throw new Error();
        setValue(text);
      } catch {
        if (!abort.signal.aborted) setFailed(true);
      }
    }
    setFailed(false);
    setValue("");
    void load();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [attempt, word, definition, language]);
  return (
    <ArticleTranslation
      text={value}
      language={language}
      interfaceLanguage={locale}
      visible
      multiline
      pending={!value && !failed}
      failed={failed}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  );
}
