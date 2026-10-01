"use client";
import React, { useContext } from "react";
import { InterfaceLanguageContext } from "./VariantControls";
import { LanguagePicker as SharedLanguagePicker } from "@/components/practice/settings/LanguagePicker";
/** The preview keeps its existing name values; the shared picker emits canonical identity. */
export function LanguagePicker({
  title,
  purpose,
  onChoose,
  onClose,
}: {
  title: string;
  purpose?: "learning" | "translation";
  onChoose: (name: string) => void;
  onClose: () => void;
}) {
  const language = useContext(InterfaceLanguageContext);
  return (
    <SharedLanguagePicker
      title={title}
      language={language}
      purpose={purpose}
      onChoose={(item) => onChoose(item.name)}
      onClose={onClose}
    />
  );
}
