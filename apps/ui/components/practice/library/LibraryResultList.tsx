"use client";
import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import {
  formatUiCount,
  getPartOfSpeechLabel,
  getUiMessages,
} from "@/lib/uiMessages";
import { WordIdentity } from "../ui/WordIdentity";
import s from "./libraryResults.module.css";

export function LibraryResultList({
  children,
  language,
  density = "compact",
  listing = "counts",
  countPosition = "near",
  hasDetail = false,
  showSource = false,
  entrySelection = false,
  appearance = "framed",
}: {
  children: React.ReactNode;
  language: OnboardingLanguage;
  density?: "compact" | "reading";
  listing?: "metadata" | "counts" | "preview";
  countPosition?: "near" | "edge";
  hasDetail?: boolean;
  showSource?: boolean;
  /** Individual collection entries need their definition to distinguish sibling senses. */
  entrySelection?: boolean;
  appearance?: "plain" | "framed";
}) {
  return (
    <div
      className={s.list}
      aria-label={getUiMessages(language).library.entries}
      tabIndex={0}
      data-appearance={appearance}
      data-density={density}
      data-listing={listing}
      data-count-position={countPosition}
      data-has-detail={hasDetail}
      data-show-source={showSource}
      data-entry-selection={entrySelection}
    >
      {children}
    </div>
  );
}

/** Presentation only: identifiers and selection stay with the search/session owner. */
export function LibraryResultRow({
  headword,
  article,
  parts,
  source,
  core,
  meaningCount,
  referenceCount,
  homographNumber,
  contentLanguage,
  language,
  selected,
  onSelect,
  onExpandAll,
  disabled = false,
  preview,
  testId,
}: {
  headword: string;
  article?: string | null;
  parts: string[];
  source: string;
  core?: string | null;
  meaningCount: number;
  referenceCount?: number;
  homographNumber?: number;
  contentLanguage: string;
  language: OnboardingLanguage;
  selected: boolean;
  onSelect: () => void;
  onExpandAll?: () => void;
  disabled?: boolean;
  preview?: string;
  testId?: string;
}) {
  const count = formatUiCount(
    language,
    referenceCount ?? meaningCount,
    getUiMessages(language).library,
    referenceCount === undefined ? "meaning" : "reference",
  );
  return (
    <button
      type="button"
      className={s.row}
      aria-pressed={selected}
      disabled={disabled}
      data-testid={testId}
      onClick={onSelect}
      onDoubleClick={onExpandAll}
    >
      <span className={s.word} lang={contentLanguage}>
        <WordIdentity article={article} headword={headword} />
        {homographNumber && <sup>{homographNumber}</sup>}
      </span>
      <span className={s.metadata}>
        {parts.map((part) => (
          <span key={part} className={s.pos} data-part={part}>
            <i aria-hidden="true" />
            {getPartOfSpeechLabel(language, part)}
          </span>
        ))}
        {core && <span className={s.badge}>{core}</span>}
        <span className={s.source}>· {source}</span>
        <span className={s.count}>{count}</span>
      </span>
      {preview && (
        <span className={s.preview} lang={contentLanguage}>
          {preview}
        </span>
      )}
    </button>
  );
}


/** A field hit is a selectable result, with the excerpt as its reading target. */
export function LibraryContextResultRow({text,headword,source,contentLanguage,selected,onSelect}:{
  text:React.ReactNode;headword:string;source?:string;contentLanguage:string;selected:boolean;onSelect:()=>void;
}) {
  return <button type="button" className={s.row} aria-pressed={selected} onClick={onSelect}>
    <span className={s.context} lang={contentLanguage}>{text}</span>
    <span className={s.metadata}><span lang={contentLanguage}>{headword}</span>{source && <span className={s.source}>· {source}</span>}</span>
  </button>;
}
