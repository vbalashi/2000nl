"use client";
import React from "react";
import { ChevronUp, Plus } from "lucide-react";
import { languageDisplayName } from "@/lib/languages/languageDisplayName";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import {
  formatUiCount,
  formatUiMessage,
  getUiMessages,
} from "@/lib/uiMessages";
import {
  addMaterialLanguage,
  materialLearningLanguages,
  moveMaterialLanguageUp,
  toggleMaterialDictionary,
  toggleMaterialLanguage,
} from "@/lib/training/material/selection";
import {
  SettingsPanel,
  SettingsRow,
} from "@/components/practice/settings/SettingsLayout";
import { useAccountMaterial } from "./AccountMaterialProvider";
import { useMaterialDictionaryCatalog } from "./useMaterialDictionaryCatalog";
import s from "@/components/practice/settings/settings.module.css";
const LanguagePicker = React.lazy(() =>
  import("@/components/practice/settings/LanguagePicker").then((module) => ({
    default: module.LanguagePicker,
  })),
);
function MaterialFeedback({ language }: { language: OnboardingLanguage }) {
  const account = useAccountMaterial();
  if (!account) return null;
  const copy = getUiMessages(language).materialPreferences;
  const message =
    account.status === "loading"
      ? copy.loading
      : account.status === "error"
        ? copy.loadError
        : account.saveStatus === "saving"
          ? copy.saving
          : account.saveStatus === "error"
            ? copy.saveError
            : account.saveStatus === "conflict"
              ? copy.conflict
              : account.saveStatus === "saved"
                ? copy.saved
                : null;
  return message ? (
    <div
      className={s.materialFeedback}
      role={
        account.status === "error" || account.saveStatus === "error"
          ? "alert"
          : "status"
      }
    >
      <span>{message}</span>
      {account.status === "error" && (
        <button
          type="button"
          className={s.materialAction}
          onClick={account.reload}
        >
          {copy.retry}
        </button>
      )}
    </div>
  ) : null;
}
export function LearningMaterialSettings({
  language,
}: {
  language: OnboardingLanguage;
}) {
  const account = useAccountMaterial();
  const [picker, setPicker] = React.useState(false);
  const copy = getUiMessages(language).settings;
  if (!account) return null;
  const languages = account.snapshot
    ? materialLearningLanguages(account.snapshot.document, account.catalog)
    : [];
  const disabled =
    account.status !== "ready" || account.saveStatus === "saving";
  return (
    <SettingsPanel title={copy.learningLanguages}>
      <p className={s.hint}>{copy.learningHint}</p>
      <MaterialFeedback language={language} />
      <ol className={s.materialLanguages}>
        {languages.map((item, index) => {
          const name = languageDisplayName(language, item.code);
          return (
            <li key={item.code}>
              <span>
                <small>{index + 1}</small>
                {name}
              </span>
              <div className={s.materialActions}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!item.paused}
                  aria-label={formatUiMessage(copy.studyLanguage, {
                    language: name,
                  })}
                  disabled={
                    !account.snapshot ||
                    (!item.paused &&
                      languages.filter((item) => !item.paused).length <= 1)
                  }
                  aria-disabled={
                    disabled ||
                    (!item.paused &&
                      languages.filter((item) => !item.paused).length <= 1)
                  }
                  onClick={() =>
                    void account.change((document) =>
                      toggleMaterialLanguage(
                        document,
                        account.catalog,
                        item.code,
                      ),
                    )
                  }
                >
                  {item.paused ? copy.paused : copy.active}
                </button>
                <button
                  type="button"
                  aria-label={formatUiMessage(copy.moveLanguage, {
                    language: name,
                  })}
                  disabled={!account.snapshot}
                  aria-disabled={disabled || index === 0}
                  onClick={() =>
                    void account.change((document) =>
                      moveMaterialLanguageUp(
                        document,
                        account.catalog,
                        item.code,
                      ),
                    )
                  }
                >
                  <ChevronUp size={16} aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className={s.addLanguage}
        disabled={!account.snapshot}
        aria-disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={picker}
        onClick={() => {
          if (!disabled) setPicker(true);
        }}
      >
        <Plus size={16} aria-hidden="true" />{copy.addLanguage}
      </button>
      {picker && (
        <React.Suspense
          fallback={
            <p role="status" className={s.hint}>
              {getUiMessages(language).languagePicker.loading}
            </p>
          }
        >
          <LanguagePicker
            language={language}
            purpose="learning"
            title={copy.addLearningLanguage}
            onChoose={(item) =>
              void account.change((document) =>
                addMaterialLanguage(document, account.catalog, item.code),
              )
            }
            onClose={() => setPicker(false)}
          />
        </React.Suspense>
      )}
    </SettingsPanel>
  );
}
export function DictionaryMaterialSettings({
  language,
}: {
  language: OnboardingLanguage;
}) {
  const account = useAccountMaterial();
  return account ? (
    <DictionaryMaterialInventory language={language} account={account} />
  ) : null;
}
function DictionaryMaterialInventory({
  language,
  account,
}: {
  language: OnboardingLanguage;
  account: NonNullable<ReturnType<typeof useAccountMaterial>>;
}) {
  const copy = getUiMessages(language).settings;
  const messages = getUiMessages(language).materialPreferences;
  const languages = account.snapshot
    ? materialLearningLanguages(account.snapshot.document, account.catalog)
    : [];
  const active = languages.filter((item) => !item.paused);
  const readableCodes = active
    .map((item) => item.code)
    .filter((code) => account.catalog.some((item) => item.code === code));
  const inventory = useMaterialDictionaryCatalog(account.userId, readableCodes);
  const personal = inventory.sources.filter((item) => item.kind === "user");
  const disabled =
    account.status !== "ready" || account.saveStatus === "saving";
  return (
    <SettingsPanel title={copy.dictionaries}>
      <MaterialFeedback language={language} />
      {inventory.status !== "ready" ? (
        <div
          role={inventory.status === "error" ? "alert" : "status"}
          className={s.materialFeedback}
        >
          <span>
            {inventory.status === "error"
              ? messages.catalogError
              : messages.loading}
          </span>
          {inventory.status === "error" && (
            <button
              type="button"
              className={s.materialAction}
              onClick={inventory.reload}
            >
              {messages.retry}
            </button>
          )}
        </div>
      ) : (
        <>
          {personal.length > 0 && (
            <div className={s.materialDictionaryGroup}>
              <h3 className={s.subheading}>{copy.personalDictionary}</h3>
              <p className={s.hint}>{copy.personalHint}</p>
              {personal.map((source) => (
                <SettingsRow
                  key={source.id}
                  title={languageDisplayName(language, source.languageCode)}
                  hint={formatUiCount(
                    language,
                    source.entryCount,
                    copy,
                    "entry",
                  )}
                >
                  <button
                    type="button"
                    className={s.materialToggle}
                    role="switch"
                    aria-label={copy.personalEnabled}
                    aria-checked="true"
                    disabled
                  >
                    <span aria-hidden="true" />
                  </button>
                </SettingsRow>
              ))}
            </div>
          )}
          {active.map((item) => {
            const sources = inventory.sources.filter(
              (source) =>
                source.languageCode === item.code && source.kind !== "user",
            );
            return (
              <div className={s.materialDictionaryGroup} key={item.code}>
                <h3 className={s.subheading}>
                  {languageDisplayName(language, item.code)}
                </h3>
                {sources.length ? (
                  sources.map((source) => (
                    <SettingsRow
                      key={source.id}
                      title={source.name}
                      hint={formatUiCount(
                        language,
                        source.entryCount,
                        copy,
                        "entry",
                      )}
                    >
                      <button
                        type="button"
                        role="switch"
                        className={s.materialToggle}
                        disabled={!account.snapshot}
                        aria-disabled={disabled}
                        aria-label={formatUiMessage(messages.useDictionary, {
                          name: source.name,
                        })}
                        aria-checked={
                          !account.snapshot?.document.disabledDictionaryIds.includes(
                            source.id,
                          )
                        }
                        onClick={() =>
                          void account.change((document) =>
                            toggleMaterialDictionary(document, source.id),
                          )
                        }
                      >
                        <span aria-hidden="true" />
                      </button>
                    </SettingsRow>
                  ))
                ) : (
                  <p className={s.hint}>{copy.noDictionaries}</p>
                )}
              </div>
            );
          })}
        </>
      )}
    </SettingsPanel>
  );
}
