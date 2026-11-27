import { Check } from "lucide-react";
import { SettingsHelp } from "@/components/practice/settings/SettingsHelp";
import settings from "@/components/practice/settings/settings.module.css";
import { getUiMessages } from "@/lib/uiMessages";
import type { AssistantAllowances } from "@/lib/platform/assistantAllowanceContract";
import styles from "./sandboxBilling.module.css";

export function AllowanceBalances({ language, allowances }: { language: string; allowances: AssistantAllowances }) {
  const copy = getUiMessages(language).settings.premiumOffer;
  const title = allowances.premium ? copy.includedWithPremium : copy.allowancesTitle;
  const number = new Intl.NumberFormat(language);
  const items = [
    [copy.aiRepliesLabel, allowances.aiRepliesRemaining],
    [copy.dictationsLabel, allowances.dictationsRemaining],
    [copy.personalMeaningsLabel, allowances.personalMeaningsRemaining],
  ] as const;
  return (
    <section className={`${settings.panel} ${styles.allowancePanel}`} aria-labelledby="subscription-allowances">
      <h2 className={settings.helpLabel}>
        <span id="subscription-allowances">{title}</span>
        <SettingsHelp label={copy.allowancesHelpLabel} text={[copy.allowancesHelpAI, copy.allowancesHelpMeanings]} />
      </h2>
      <dl className={styles.allowances}>
        {items.map(([label, remaining]) => <div key={label}>
          <dt>{label}</dt>
          <dd>{allowances.premium ? <><Check size={15} aria-hidden="true" /><span className="sr-only">{copy.includedWithPremium}</span></> : number.format(remaining)}</dd>
        </div>)}
      </dl>
    </section>
  );
}
