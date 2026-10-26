"use client";

import React from "react";
import { ApprovedTextSizeSection } from "./ApprovedTextSizeSection";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";

export function ReadingSettingsSection({ language }: { language: OnboardingLanguage }) {
  return <ApprovedTextSizeSection language={language} />;
}
