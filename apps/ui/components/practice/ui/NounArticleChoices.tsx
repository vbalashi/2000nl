"use client";
import React, { useEffect, useRef, useState } from "react";

import { singleNounArticle, toggleNounArticle, type NounArticle } from "@/lib/training/nounArticles";

/** Retain both/no selections locally; the Library contract stores a single restriction. */
export function NounArticleChoices({ article, onChange, className }: {
  article: NounArticle | null;
  onChange: (article: NounArticle | null) => void;
  className: string;
}) {
  const [selected, setSelected] = useState<NounArticle[]>(article ? [article] : []);
  const emitted = useRef(article);
  useEffect(() => {
    if (article !== emitted.current) {
      emitted.current = article;
      setSelected(article ? [article] : []);
    }
  }, [article]);
  return <>{(["de", "het"] as const).map(value => <button type="button" key={value}
    className={className} aria-pressed={selected.includes(value)} data-selected={selected.includes(value)}
    onClick={() => {
      const next = toggleNounArticle(selected, value);
      setSelected(next);
      emitted.current = singleNounArticle(next);
      onChange(emitted.current);
    }}>{value}</button>)}</>;
}
