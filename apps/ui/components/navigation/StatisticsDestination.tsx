"use client";

import React from "react";
import { getUiMessages } from "@/lib/uiMessages";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { DetailedStats } from "@/lib/types";
import type { MaterialProgress } from "@/lib/training/activity/material";
import { AccountStatistics } from "./statistics/AccountStatistics";

type Props = {
  userId?: string;
  languageCode?: string;
  open: boolean;
  interfaceLanguage: OnboardingLanguage;
  stats: DetailedStats;
  onStartTraining: () => void;
  onPractiseMaterial?: (languageCode: string, material: MaterialProgress) => void;
  onHistory?: () => void;
};

export function StatisticsDestination(props: Props) {
  const { userId, languageCode, open, interfaceLanguage, onStartTraining, onPractiseMaterial, onHistory } = props;
  if (!userId || !languageCode) return null;
  return (
    <section aria-hidden={!open} aria-label={getUiMessages(interfaceLanguage).navigation.statistics} className={`${open ? "flex" : "hidden"} h-full min-h-0 flex-col overflow-hidden`}>
      <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto">
        <AccountStatistics userId={userId} languageCode={languageCode} open={open} interfaceLanguage={interfaceLanguage}
          onPractiseMaterial={onPractiseMaterial ?? (() => onStartTraining())} onHistory={onHistory} />
      </div>
    </section>
  );
}
