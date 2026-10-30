"use client";

import React from "react";
import { DialogSurface } from "@/components/practice/ui/DialogSurface";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import { previewLocales } from "./content";
import styles from "./preview.module.css";

// Preview-only form: deliberately has no delivery client or outbox import.
export function PreviewReport({ language, onClose }: { language: OnboardingLanguage; onClose: () => void }) {
  const copy = previewLocales[language];
  const t = (key: string) => platformV2Message(language, `senseCard.reportSheet.${key}`);
  return <DialogSurface className={styles.reportDialog} lang={language} onDismiss={onClose}
    aria-labelledby="preview-report-title" aria-describedby="preview-report-help" data-training-hotkeys-suspended="true">
    <h2 id="preview-report-title">{t("title")}</h2>
    <p id="preview-report-help">{copy.reportDemo}</p>
    <fieldset><legend className="sr-only">{t("title")}</legend>
      {["translation-quality", "content-quality", "rendering", "loading", "training-action", "other"].map(category =>
        <label key={category}><input type="radio" name="preview-report-kind" value={category}/>{t(`categories.${category}`)}</label>)}
    </fieldset>
    <label>{t("commentLabel")} ({t("optional")})
      <textarea rows={2} maxLength={1000} placeholder={t("commentPlaceholder")}/>
    </label>
    <footer><button className={styles.confirm} onClick={onClose}>{t("back")}</button>
      <button className={styles.confirm} disabled>{t("send")}</button></footer>
  </DialogSurface>;
}
