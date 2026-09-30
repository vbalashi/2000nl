"use client";
import React, { useState, useRef, useEffect } from "react";
import { getUiMessages, formatUiCount } from "@/lib/uiMessages";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import {
  searchCatalogLanguages,
  catalogLanguageLabel,
  type CatalogLanguage,
} from "@/lib/languages/languageCatalog";
import { DialogSurface } from "@/components/practice/ui/DialogSurface";
import { IconAction } from "@/components/practice/ui/IconAction";
import { X } from "lucide-react";
import s from "./languagePicker.module.css";
/** Emits catalog identity, so production stores ISO codes and preview adapters can keep names. */
export function LanguagePicker({
  title,
  language,
  selectedCode,
  onChoose,
  onClose,
}: {
  title: string;
  language: OnboardingLanguage;
  selectedCode?: string | null;
  onChoose: (item: CatalogLanguage) => void;
  onClose: () => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    searchRef.current?.focus();
  }, []);
  const copy = getUiMessages(language).languagePicker;
  const [query, setQuery] = useState(""),
    [limit, setLimit] = useState(60);
  const results = searchCatalogLanguages(query);
  return (
    <DialogSurface
      onDismiss={onClose}
      className={s.picker}
      aria-label={title}
      lang={language}
    >
      <header>
        <h2>{title}</h2>
        <IconAction label={copy.close} onClick={onClose}>
          <X size={20} />
        </IconAction>
      </header>
      <input
        ref={searchRef}
        aria-label={copy.search}
        placeholder={copy.placeholder}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setLimit(60);
        }}
      />
      <p>
        {formatUiCount(language, results.length, copy, "language")} · ISO 639-3
      </p>
      <div className={s.results}>
        {results.slice(0, limit).map((item) => (
          <button
            type="button"
            key={item.code}
            aria-current={selectedCode === item.code ? "true" : undefined}
            onClick={() => {
              onChoose(item);
              onClose();
            }}
          >
            <span>
              {catalogLanguageLabel(language, item)}
              {item.native &&
                item.native !== item.name &&
                item.native !== item.code && (
                  <small lang={item.code}>{item.native}</small>
                )}
            </span>
            <small>{item.code}</small>
          </button>
        ))}
        {!results.length && <p>{copy.empty}</p>}
        {results.length > limit && (
          <button
            type="button"
            onClick={() => setLimit((value) => value + 100)}
          >
            {copy.more}
          </button>
        )}
      </div>
      <footer>{copy.footer}</footer>
    </DialogSurface>
  );
}
