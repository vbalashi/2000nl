import { getUiMessages } from "@/lib/uiMessages";
import type { AssistantAllowances } from "@/lib/platform/assistantAllowanceContract";
import styles from "./sandboxBilling.module.css";

export function AllowanceBalances({ language, allowances }: { language: string; allowances: AssistantAllowances }) {
  const copy = getUiMessages(language).settings.premiumOffer;
  const number = new Intl.NumberFormat(language);
  const items = [
    [copy.aiRepliesLabel, allowances.aiRepliesRemaining],
    [copy.dictationsLabel, allowances.dictationsRemaining],
    [copy.personalMeaningsLabel, allowances.personalMeaningsRemaining],
  ] as const;
  return (
    <section className={styles.management} aria-labelledby="subscription-allowances">
      <h3 id="subscription-allowances">{copy.allowancesTitle}</h3>
      <dl className={styles.allowances}>
        {items.map(([label, remaining]) => <div key={label}>
          <dt>{label}</dt><dd>{allowances.premium ? copy.includedWithPremium : number.format(remaining)}</dd>
        </div>)}
      </dl>
    </section>
  );
}
