"use client";

import { useState } from "react";
import { PremiumOffer } from "@/components/billing/PremiumOffer";
import type { SandboxCheckoutClient } from "@/components/billing/SandboxPlanCheckout";
import { SandboxBillingSection } from "@/components/navigation/SandboxBillingSection";
import theme from "@/components/practice/ui/practiceTheme.module.css";
import { ActionButton } from "@/components/practice/ui/ActionButton";
import { PersonalCardAssistant } from "@/components/training/wordlist/PersonalCardAssistant";
import { PersonalDictionaryEntryDraft } from "@/components/training/wordlist/PersonalDictionaryEntryDraft";
import type { AssistantAllowances } from "@/lib/platform/assistantAllowanceContract";
import styles from "./preview.module.css";

const fresh: AssistantAllowances = {
  premium: false, manualUntil: null, aiRepliesRemaining: 2, dictationsRemaining: 10, personalMeaningsRemaining: 100,
};
const empty: AssistantAllowances = { ...fresh, aiRepliesRemaining: 0, dictationsRemaining: 0, personalMeaningsRemaining: 0 };
const premium: AssistantAllowances = { ...fresh, premium: true, manualUntil: "2027-01-15T12:00:00Z" };

const checkoutClient: SandboxCheckoutClient = {
  async prepare() {
    return {
      checkoutReady: true,
      fulfillment: false,
      offer: {
        amounts: { month: "€6.00", year: "€60.00" },
        open(id, options) {
          const annual = id === "preview-year";
          const frame = document.createElement("iframe");
          frame.title = "Paddle Sandbox form preview";
          frame.style.cssText = "width:100%;height:330px;border:0;border-radius:10px";
          const dark = options.theme === "dark";
          frame.srcdoc = `<!doctype html><html lang="en"><meta charset="utf-8"><body style="color-scheme:${options.theme};background:${dark ? "#201e2b" : "#fff"};color:${dark ? "#f5efff" : "#211c30"};font:14px system-ui;margin:16px"><style>input,select,button{box-sizing:border-box; width:100%; min-height:35px; margin:3px 0 0; border-radius:6px; border:1px solid currentColor; padding:5px 8px;} fieldset:disabled{opacity:.75;}</style><h2 style="font-size:19px">Payment details</h2><p>Local Paddle layout preview. No payment is sent.</p><fieldset disabled style="border:0;padding:0;display:grid;gap:12px"><label>Email address<br><input placeholder="learner@example.test"></label><label>Country<br><select><option>Netherlands</option></select></label><label>Card details<br><input placeholder="Card number"></label><button>Subscribe</button></fieldset></body></html>`;
          document.getElementsByClassName(options.frameTarget)[0]?.append(frame);
          options.onSummary({
            currency: "EUR", subtotal: annual ? 49.59 : 4.96, tax: annual ? 10.41 : 1.04,
            due: annual ? 60 : 6, renewal: annual ? 60 : 6, discount: 0, credit: 0,
          });
          return {
            closeIfUnpaid() { frame.remove(); options.onClose(true); },
            dispose() { frame.remove(); },
          };
        },
      },
    };
  },
  async start(plan) { return { transactionId: `preview-${plan}`, receipt: "preview" }; },
  async status() { return "pending"; },
};

type View = "billing" | "assistant" | "word";
type OfferEntry = "settings" | "assistant" | "dictation" | "personalMeanings";

export function AllowancesPreview() {
  const [balances, setBalances] = useState(fresh);
  const [view, setView] = useState<View>("billing");
  const [dark, setDark] = useState(true);
  const [offer, setOffer] = useState<OfferEntry | null>(null);
  const [opener, setOpener] = useState<HTMLElement>();
  const [draft, setDraft] = useState({ word: "afspraak", definition: "Een afgesproken ontmoeting." });

  function open(entry: OfferEntry, element?: HTMLElement) {
    setOpener(element);
    setOffer(entry);
  }

  return <div className={`${theme.theme} ${styles.page}`} data-colour-mode={dark ? "dark" : "light"} data-account-palette="default">
    <div className={styles.shell} inert={Boolean(offer)}>
      <header className={styles.header}>
        <h1>2000nl · Local review</h1>
        <ActionButton onClick={() => setDark(value => !value)}>{dark ? "Light theme" : "Dark theme"}</ActionButton>
      </header>
      <p className={styles.notice}>Demo account and Paddle fixture. Changes stay in this tab.</p>
      <nav className={styles.toolbar} aria-label="Preview balances">
        <ActionButton onClick={() => setBalances(fresh)}>Free · 2 / 10 / 100</ActionButton>
        <ActionButton onClick={() => setBalances(empty)}>Free · 0 / 0 / 0</ActionButton>
        <ActionButton onClick={() => setBalances(premium)}>Premium grant</ActionButton>
      </nav>
      <div className={styles.layout}>
        <nav className={styles.sections} aria-label="Preview sections">
          <ActionButton aria-pressed={view === "billing"} onClick={() => setView("billing")}>Billing & subscriptions</ActionButton>
          <ActionButton aria-pressed={view === "assistant"} onClick={() => setView("assistant")}>Ask AI</ActionButton>
          <ActionButton aria-pressed={view === "word"} onClick={() => setView("word")}>Personal meaning</ActionButton>
        </nav>
        <main className={styles.content}>
          {view === "billing" && <SandboxBillingSection
            language="en" preview={balances} offerOpen={offer === "settings"}
            onExplorePlans={element => open("settings", element)}
          />}
          {view === "assistant" && <PersonalCardAssistant
            word={draft.word} definition={draft.definition} languageCode="nl" interfaceLanguage="en"
            senseKey="review-assistant" ordinal={1} onClose={() => setView("billing")} onApply={() => {}}
            allowances={balances} onPremiumRequired={(element, feature) => open(feature === "dictation" ? "dictation" : "assistant", element)}
            requestReply={async () => {
              setBalances(value => value.premium ? value : { ...value, aiRepliesRemaining: Math.max(0, value.aiRepliesRemaining - 1) });
              return Response.json({ mode: "provider", message: "Een afspraak is een plan om iemand op een bepaalde tijd te ontmoeten.", suggestions: [] });
            }}
          />}
          {view === "word" && <PersonalDictionaryEntryDraft
            {...draft} languageCode="nl" interfaceLanguage="en" allowances={balances} mobile={false}
            assistantAvailable={false} onExplorePremium={element => open("assistant", element)}
            onExplorePersonalMeanings={element => open("personalMeanings", element)}
            onChange={patch => setDraft(value => ({ ...value, ...patch }))}
            saveArticle={async () => {
              setBalances(value => value.premium ? value : { ...value, personalMeaningsRemaining: Math.max(0, value.personalMeaningsRemaining - 1) });
              return [crypto.randomUUID()];
            }}
            onClose={() => setView("billing")} onRead={() => setView("billing")} onSaved={() => setView("billing")}
          />}
        </main>
      </div>
    </div>
    {offer && <PremiumOffer entry={offer} language="en" checkoutClient={checkoutClient} previewColourMode={dark ? "dark" : "light"}
      onDismiss={() => { setOffer(null); requestAnimationFrame(() => opener?.focus({ preventScroll: true })); }}/>}
  </div>;
}
