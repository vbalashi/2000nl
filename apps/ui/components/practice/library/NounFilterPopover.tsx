"use client";

import React, { useEffect, useRef } from "react";
import {DialogSurface} from "@/components/practice/ui/DialogSurface";
import { X } from "lucide-react";
import {getUiMessages} from "@/lib/uiMessages";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import f from "./libraryFilters.module.css";

export function NounFilterPopover({ locale, anchor, article, onChange, onClose }: {
  locale: OnboardingLanguage; anchor: HTMLButtonElement; article: "de" | "het" | null;
  onChange: (article: "de" | "het" | null) => void; onClose: () => void;
}) {
  const copy=getUiMessages(locale);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const place = () => {
      const bounds = anchor.getBoundingClientRect();
      const width = dialog.offsetWidth;
      const height = dialog.offsetHeight;
      dialog.style.left = `${Math.max(12, Math.min(bounds.left - 12, window.innerWidth - width - 12))}px`;
      dialog.style.top = `${Math.max(12, Math.min(bounds.bottom + 10, window.innerHeight - height - 12))}px`;
    };
    place();
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("resize", place);  };
  }, [anchor]);
  return <DialogSurface onDismiss={onClose} ref={ref} className={f.popover} aria-label={copy.builder.nounArticle} lang={locale} onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}>
    <div className={f.popoverHeader}><h3>{copy.builder.nounArticle}</h3><button type="button" className={f.icon} aria-label={copy.builder.closeNounSubfilters} onClick={onClose}><X size={17}/></button></div>
    <div className={f.parts}>{(["de", "het"] as const).map(value => <button type="button" className={f.chip} key={value} aria-pressed={!article || article === value} data-selected={!article || article === value} onClick={() => onChange(article ? null : value)}>{value}</button>)}</div>
    <p className={f.help}>{copy.library.bothArticles}</p>
  </DialogSurface>;
}
