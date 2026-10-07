"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { WordDetailsCloseProvider } from "./WordDetailsHeader";
import { PracticePanel } from "@/components/practice/ui/PracticePanel";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";

type Props = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode | ((entered: boolean) => React.ReactNode);
  interfaceLanguage: OnboardingLanguage;
};

export function TrainingDetailsDrawer({
  open,
  onClose,
  children,
  interfaceLanguage,
}: Props) {
  const [entered, setEntered] = React.useState(false);
  const dismissRef = React.useRef(onClose);
  React.useEffect(() => {
    if (!open) setEntered(false);
  }, [open]);
  if (!open) return null;

  return (
    <PracticePanel
      title={platformV2Message(interfaceLanguage, "senseCard.wordDetails.open")}
      closeLabel={platformV2Message(interfaceLanguage, "common.close")}
      language={interfaceLanguage}
      headless
      onClose={onClose}
      onEntered={() => setEntered(true)}
    >
      {dismiss => {
        dismissRef.current = dismiss;
        return <WordDetailsCloseProvider onClose={dismiss} interfaceLanguage={interfaceLanguage}>
          <div className="min-h-0 flex-1">
            {typeof children === "function" ? children(entered) : children}
          </div>
        </WordDetailsCloseProvider>;
      }}
    </PracticePanel>
  );
}
