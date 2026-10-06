"use client";
import React from "react";
import {SegmentedControl} from "../practice/ui/SegmentedControl";
import layout from "@/components/practice/settings/settings.module.css";
import { getUiMessages } from "@/lib/uiMessages";
import { accountTextSize, textSizes } from "@/lib/reading/textScale";
import { readingSizes } from "@/lib/reading/readingSize";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { useReadingSettings } from "./ReadingPreferencesProvider";
import { readingSettingsCopy } from "./readingSettingsCopy";
import theme from "@/components/practice/ui/practiceTheme.module.css";
import s from "./textPreferences.module.css";
import { ProductionArticleReading } from "@/components/practice/article/ProductionArticleReading";
import { ArticleContentNode, ArticleMeaningDetails } from "@/components/practice/article/ArticleContent";
import { SenseCardHeadwordLockup } from "@/components/training/SenseCardChrome";
import type { PlatformV2SenseContentNode } from "@/lib/platform/projections/platformV2SenseContent";
const previewDefinition: PlatformV2SenseContentNode = {contentNodeId:"preview-definition",parentContentNodeId:null,kind:"definition",text:"een vervoermiddel met twee wielen",children:[]};
const previewExample: PlatformV2SenseContentNode = {contentNodeId:"preview-example",parentContentNodeId:null,kind:"example",text:"Ik ga met de fiets naar mijn werk.",translation:"I cycle to work.",children:[]};

export function ApprovedTextSizeSection({
  language,
  embedded = false,
}: {
  language: OnboardingLanguage;
  embedded?: boolean;
}) {
  const settings = useReadingSettings();
  if (!settings) return null;
  const copy = getUiMessages(language),
    text = copy.settings,
    status = readingSettingsCopy[language];
  const active = settings.preferences[settings.device];
  const saveStatus = settings.saveStatus[settings.device];
  return (
    <section
      className={`${theme.theme} ${embedded ? `${s.embedded} ${layout.panel}` : s.section}`}
      data-colour-mode="app"
    >
      <div className={s.preferenceRow}>
      <h2>{text.textSize}</h2>
      <SegmentedControl standard label={text.textSize}>
        {readingSizes.map((size) => {
          const display = textSizes.find(
            (item) => item.id === accountTextSize[size],
          )!;
          return (
            <button
              key={size}
              type="button"
              aria-label={text.sizes[display.id]}
              aria-pressed={active === size}
              disabled={
                settings.loadStatus !== "ready" || saveStatus === "saving"
              }
              onClick={() => void settings.save(settings.device, size)}
            >
              {display.label}
            </button>
          );
        })}
      </SegmentedControl>
      </div>
      {settings.loadStatus === "loading" && (
        <p role="status">{status.loading}</p>
      )}
      {settings.loadStatus === "error" && (
        <div role="alert">
          <p>{status.loadError}</p>
          <button type="button" onClick={settings.reload}>
            {status.retry}
          </button>
        </div>
      )}
      {saveStatus === "saving" && <p role="status">{status.saving}</p>}
      {saveStatus === "error" && (
        <div role="alert">
          <p>{status.saveError}</p>
          <button
            type="button"
            onClick={() => void settings.save(settings.device, active)}
          >
            {status.retry}
          </button>
        </div>
      )}
      <div className={s.preview} aria-label={status.preview}>
        <ProductionArticleReading>
          <SenseCardHeadwordLockup article="de" headword="fiets" tone="light" variant="training-answer" showMetadata={false}/>
          <ArticleContentNode node={previewDefinition} interfaceLanguage={language} contentLanguage="nl" lead/>
          <ArticleMeaningDetails definition={null} details={[previewExample]} interfaceLanguage={language} contentLanguage="nl" translationLanguage="en" translationVisible/>
        </ProductionArticleReading>
      </div>
    </section>
  );
}
