import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import { X } from "lucide-react";
import sheet from "@/components/practice/article/wordDetailsSheet.module.css";

const WordDetailsCloseContext = React.createContext<(() => void) | null>(null);
export const useWordDetailsClose = () => React.useContext(WordDetailsCloseContext);
export function WordDetailsCloseProvider({onClose,interfaceLanguage,children}:{onClose:()=>void;interfaceLanguage:OnboardingLanguage;children:React.ReactNode}) {
  return <WordDetailsCloseContext.Provider value={onClose}><div className={sheet.closeHost}>
    <div className={sheet.fallbackClose}><WordDetailsHeader onClose={onClose} interfaceLanguage={interfaceLanguage}/></div>
    {children}
  </div></WordDetailsCloseContext.Provider>;
}

export function WordDetailsHeader({ onClose, interfaceLanguage }: {
  onClose: () => void;
  interfaceLanguage: OnboardingLanguage;
}) {
  return (
    <header className={sheet.header}>
      <button type="button" aria-label={platformV2Message(interfaceLanguage, "common.close")} onClick={onClose} className={sheet.close}>
        <X aria-hidden="true" size={18} />
      </button>
    </header>
  );
}
