"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Sparkles, Trash2, X } from "lucide-react";
import { ActionMenu } from "@/components/practice/ui/ActionMenu";
import { AddAction } from "@/components/practice/ui/AddAction";
import { ProductionArticleReading } from "@/components/practice/article/ProductionArticleReading";
import {
  SenseCardHeaderAction,
  SenseCardTranslateIcon,
  SenseCardHeadwordLockup,
} from "../SenseCardChrome";
import { languageDisplayName } from "@/lib/languages/languageDisplayName";
import { getPartOfSpeechLabel } from "@/lib/uiMessages";
import { getInterfaceCatalog } from "@/lib/i18n/catalog";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import {
  VOCABULARY_PARTS,
  partId,
  partCode,
} from "@/lib/vocabulary/partsOfSpeech";
import {
  movePersonalMeaning,
  savePersonalArticle,
  type PersonalField,
} from "@/lib/training/personalArticleClient";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import {
  PersonalCardAssistant,
  type AssistantSession,
} from "./PersonalCardAssistant";
import {
  AddData,
  draftField,
  fieldPayload,
  InlineText,
  PersonalCardField,
  PersonalFieldGroup,
  type DraftField,
} from "./PersonalCardField";
import { DraftWordAudio } from "./DraftWordAudio";
import { PersonalMoveDialog } from "./PersonalMoveDialog";
import { PersonalDraftTranslation } from "./PersonalDraftTranslation";
import { personalCardCopy } from "./personalCardCopy";
import surfaces from "@/components/practice/article/articleSurfaces.module.css";
import reading from "@/components/practice/article/articleContent.module.css";
import actions from "@/components/practice/article/articleActions.module.css";
import chrome from "@/components/practice/article/senseChrome.module.css";
import s from "./personalDictionaryEntryDraft.module.css";

export type InitialPersonalSense = {
  entryId?: string;
  definition: string;
  dirty?: boolean;
  fields?: PersonalField[];
};
type DraftSense = {
  key: string;
  entryId?: string;
  definition: string;
  fields: DraftField[];
  dirty: boolean;
  fresh?: boolean;
};
export type PersonalHeader = { article: "de" | "het" | null; kind: "word" | "expression" };
type SavedSense = PersonalHeader & {
  id: string;
  word: string;
  definition: string;
  partOfSpeech: string | null;
};
type Props = {
  word: string;
  definition: string;
  onChange: (patch: { word?: string; definition?: string }) => void;
  languageCode: string;
  interfaceLanguage: OnboardingLanguage;
  translationLanguage?: string | null;
  initialArticle?: PersonalHeader["article"];
  initialKind?: PersonalHeader["kind"];
  initialPart?: string | null;
  initialSenses?: InitialPersonalSense[];
  anchorEntryId?: string;
  onDraftChange?: (
    senses: InitialPersonalSense[],
    part: string | null,
    headerDirty: boolean,
    header: PersonalHeader,
  ) => void;
  initiallyDirty?: boolean;
  initialHeaderDirty?: boolean;
  onPartialSave?: (entry: SavedSense, senses: InitialPersonalSense[]) => void;
  mobile: boolean;
  assistantAvailable: boolean;
  assistantHost?: HTMLElement | null;
  onAssistantOpenChange?: (open: boolean) => void;
  onClose: () => void;
  onDeleteDraft?: () => void;
  onRead: (entryId: string) => void;
  onSaved: (entry: SavedSense) => void;
};
function draftSense(value: InitialPersonalSense): DraftSense {
  return {
    key: value.entryId ?? crypto.randomUUID(),
    entryId: value.entryId,
    dirty: value.dirty ?? !value.entryId,
    definition: value.definition,
    fields: (value.fields ?? []).map((f) => draftField(f)),
  };
}
function snapshotSense({
  entryId,
  definition,
  fields,
  dirty,
}: DraftSense): InitialPersonalSense {
  return {
    entryId,
    definition,
    dirty,
    fields: fields.map(({ key: _key, fresh: _fresh, children, ...field }) => ({
      ...field,
      children: children?.map(({ kind, text }) => ({ kind, text })),
    })),
  };
}
const kinds = [
  "example",
  "note",
  "synonym",
  "reference",
  "expression",
] as const;

export function PersonalDictionaryEntryDraft({
  word,
  definition,
  onChange,
  languageCode,
  interfaceLanguage,
  translationLanguage,
  initialPart,
  initialArticle = null,
  initialKind = "word",
  onRead,
  initialSenses,
  initiallyDirty = false,
  initialHeaderDirty = false,
  onPartialSave,
  onDraftChange,
  anchorEntryId,
  onClose,
  onDeleteDraft,
  onSaved,
  mobile,
  assistantAvailable,
  assistantHost,
  onAssistantOpenChange,
}: Props) {
  const copy = personalCardCopy(interfaceLanguage);
  const dictionaryLabel = `${copy.source} · ${languageDisplayName(interfaceLanguage, languageCode)}`;
  const [senses, setSenses] = React.useState(() =>
    (initialSenses?.length ? initialSenses : [{ definition }]).map(draftSense),
  );
  const [part, setPart] = React.useState(initialPart ?? null);
  const [article, setArticle] = React.useState(initialArticle);
  const [kind, setKind] = React.useState(initialKind);
  const [articleAnchor, setArticleAnchor] = React.useState<HTMLButtonElement | null>(null);
  const showArticle = languageCode === "nl" && partId(part ?? "") === "noun" && kind === "word";
  const [posAnchor, setPosAnchor] = React.useState<HTMLButtonElement | null>(
    null,
  );
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [dirty, setDirty] = React.useState(initiallyDirty);
  const [headerDirty, setHeaderDirty] = React.useState(initialHeaderDirty);
  const [anchor, setAnchor] = React.useState(anchorEntryId);
  const mirror = React.useRef(onDraftChange);
  mirror.current = onDraftChange;
  React.useEffect(() => {
    if (dirty) mirror.current?.(senses.map(snapshotSense), part, headerDirty, {article, kind});
  }, [dirty, senses, part, headerDirty, article, kind]);
  const [assistant, setAssistant] = React.useState<string | null>(null);
  const [moveTarget, setMoveTarget] = React.useState<DraftSense | null>(null);
  const [translated, setTranslated] = React.useState(false);
  const lock = React.useRef(false);
  const [assistantSession] = React.useState<AssistantSession>(() => new Map());
  const askButton = React.useRef<HTMLButtonElement | null>(null);
  const root = React.useRef<HTMLElement>(null);
  const chosen = senses.find((s) => s.key === assistant);
  const hasUnsaved = headerDirty || senses.some(sense => sense.dirty || !sense.entryId);
  const ready = (sense: DraftSense) =>
    !!word.trim() &&
    !!sense.definition.trim() &&
    (sense.dirty || headerDirty) &&
    !sense.fields.some(field => !field.text.trim() && field.children?.some(child => child.text.trim()));
  const canTranslate =
    !!translationLanguage &&
    translationLanguage !== "off" &&
    !!word.trim() &&
    senses.some((s) => s.definition.trim());
  function edit() {
    setDirty(true);
    setFailed(false);
    setTranslated(false);
  }
  function changeSense(key: string, patch: Partial<DraftSense>) {
    edit();
    setSenses((current) =>
      current.map((sense) =>
        sense.key === key ? { ...sense, ...patch, dirty: true } : sense,
      ),
    );
    if (key === senses[0].key && patch.definition !== undefined)
      onChange({ definition: patch.definition });
  }
  function toggleAssistant(key: string | null) {
    setAssistant(key);
    onAssistantOpenChange?.(!!key);
    if (!key) askButton.current?.focus({ preventScroll: true });
  }
  async function save(sense: DraftSense) {
    if (lock.current || !ready(sense)) return;
    lock.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const populatedFields = sense.fields.filter(field => field.text.trim()).map(field => ({
        ...field, children:field.children?.filter(child => child.text.trim()),
      }));
      const [id] = await savePersonalArticle({
        languageCode,
        headword: word.trim(),
        partOfSpeech: part,
        article, kind,
        anchorEntryId: anchor,
        beforeEntryId: sense.entryId ? undefined : senses.slice(senses.indexOf(sense)+1).find(s=>s.entryId)?.entryId,
        senses: [
          {
            entryId: sense.entryId,
            definition: sense.definition.trim(),
            fields: populatedFields.map(fieldPayload),
          },
        ],
      });
      const next = senses.map((value) =>
        value.key === sense.key
          ? { ...value, entryId: id, dirty: false, fields:populatedFields }
          : value,
      );
      const saved = {
        id,
        word: word.trim(),
        definition: sense.definition.trim(),
        partOfSpeech: part,
        article, kind,
      };
      setAnchor(anchor ?? id);
      setHeaderDirty(false);
      if (next.some((s) => s.dirty || !s.entryId)) {
        setSenses(next);
        onPartialSave?.(saved, next.map(snapshotSense));
      } else {
        toggleAssistant(null);
        onSaved(saved);
      }
    } catch {
      setFailed(true);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function move(sense: DraftSense, target: string | null) {
    if (!sense.entryId || hasUnsaved || lock.current) return;
    lock.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await movePersonalMeaning(sense.entryId, target);
      toggleAssistant(null);
      onSaved({
        id: sense.entryId,
        word,
        definition: sense.definition,
        partOfSpeech: part,
        article, kind,
      });
    } catch {
      setMoveTarget(null);
      setFailed(true);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function choosePart(value: string | null) {
    edit();
    setHeaderDirty(true);
    setKind("word");
    setPart(value);
    if (partId(value ?? "") !== "noun") setArticle(null);
    setPosAnchor(null);
    posAnchor?.focus();
  }
  const assistantPanel = assistantAvailable && chosen && (
    <aside data-personal-assistant="" className={s.assistant}>
      <PersonalCardAssistant
        key={chosen.key}
        session={assistantSession}
        article={{
          kind,
          nounArticle: article,
          partOfSpeech: part,
          senses: senses.map((s) => ({
            definition: s.definition,
            fields: s.fields.map(fieldPayload),
          })),
        }}
        word={word}
        definition={chosen.definition}
        languageCode={languageCode}
        interfaceLanguage={interfaceLanguage}
        senseKey={chosen.key}
        ordinal={senses.indexOf(chosen) + 1}
        onClose={() => toggleAssistant(null)}
        onApply={(suggestion, key) => {
          const target = senses.find((s) => s.key === key);
          if (!target || target.key !== assistant) return;
          if (suggestion.kind === "definition")
            changeSense(key, { definition: suggestion.text });
          else if (suggestion.kind === "partOfSpeech") {
            const id = partId(suggestion.text);
            if (id) choosePart(partCode(id));
          } else
            changeSense(key, {
              fields: [
                ...target.fields,
                draftField({ kind: suggestion.kind, text: suggestion.text }),
              ],
            });
        }}
      />
    </aside>
  );
  const panelHost =
    assistantHost ??
    (assistant &&
      root.current?.closest<HTMLElement>("[data-practice-palette]")) ??
    null;
  const deleteDraft = !anchor && onDeleteDraft && (
    <button type="button" className={s.deleteDraft} onClick={onDeleteDraft}>
      <Trash2 size={16} aria-hidden="true" />
      {copy.deleteDraft}
    </button>
  );
  return (
    <section
      ref={root}
      data-mobile-editor={mobile || undefined}
      className={`${surfaces.group} ${s.editor}`}
      aria-label={copy.source}
    >
      <fieldset className={s.fieldset} disabled={busy}>
        <div className={s.editorContent}>
        <header
          className={`shrink-0 px-4 pb-5 pt-4 sm:px-7 ${surfaces.header} ${s.editorHeader}`}
        >
          <SenseCardHeadwordLockup
            headword={word || copy.word}
            interfaceLanguage={interfaceLanguage}
            variant="article"
            tone="light"
            dictionaryLabel={dictionaryLabel}
            article={showArticle ? article : null}
            articleContent={showArticle && (
              <button type="button" className={s.articlePicker} aria-label={copy.article}
                aria-haspopup="menu" aria-expanded={!!articleAnchor}
                onClick={event => setArticleAnchor(event.currentTarget)}>
                {article ?? copy.article}<ChevronDown size={12}/>
              </button>
            )}
            metadataContent={
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={!!posAnchor}
                className={s.pos}
                title={copy.pos}
                onClick={(e) => setPosAnchor(e.currentTarget)}
              >
                <span
                  aria-hidden="true"
                  className={`${chrome.dot} ${part ? "" : s.unset}`}
                />
                {kind === "expression" ? copy.expression : getPartOfSpeechLabel(interfaceLanguage, part) || copy.unset}
                <ChevronDown size={12} />
              </button>
            }
            headerActions={
              <>
                <DraftWordAudio
                  word={word}
                  languageCode={languageCode}
                  locale={interfaceLanguage}
                />
                <SenseCardHeaderAction
                  accent
                  label={platformV2Message(
                    interfaceLanguage,
                    "senseCard.translation.request",
                  )}
                  pressed={translated}
                  disabled={!canTranslate}
                  onClick={() => setTranslated((v) => !v)}
                >
                  <SenseCardTranslateIcon />
                </SenseCardHeaderAction>
                {!mobile && deleteDraft}
                <span data-card-header-close="" data-onboarding="details-close"
                  className={deleteDraft && !mobile ? s.closeNextToDelete : surfaces.closeAction}>
                  <SenseCardHeaderAction
                    label={copy.close}
                    onClick={() => {
                      toggleAssistant(null);
                      onClose();
                    }}
                  >
                    <X size={18} />
                  </SenseCardHeaderAction>
                </span>
              </>
            }
            headwordContent={
              <InlineText
                value={word}
                placeholder={copy.word}
                label={copy.editWord}
                onChange={(word) => {
                  edit();
                  setHeaderDirty(true);
                  onChange({ word });
                }}
              />
            }
          />
          {articleAnchor && <ActionMenu anchor={articleAnchor} title={copy.article}
            language={interfaceLanguage} onClose={() => {setArticleAnchor(null); articleAnchor.focus();}}
            items={([null,"de","het"] as const).map(value => ({
              id:value ?? "none", label:value ?? copy.noArticle, checked:value === article,
              onSelect:() => {if (value !== article) {edit(); setHeaderDirty(true); setArticle(value);} setArticleAnchor(null); articleAnchor.focus();}
            }))}/>}
          {posAnchor && (
            <ActionMenu
              anchor={posAnchor}
              title={copy.pos}
              language={interfaceLanguage}
              onClose={() => {
                setPosAnchor(null);
                posAnchor.focus();
              }}
              items={[
                {id:"expression", label:copy.expression, checked:kind === "expression",
                  onSelect:() => {edit(); setHeaderDirty(true); setKind("expression"); setPart(null); setArticle(null); setPosAnchor(null); posAnchor.focus();}},
                ...[{ code: null, label: copy.unset },
                  ...VOCABULARY_PARTS.map((part) => ({
                    code: part.code,
                    label: getPartOfSpeechLabel(interfaceLanguage, part.code) ?? part.id,
                  })),
                  { code: "other", label: getInterfaceCatalog(interfaceLanguage).partOfSpeech.other },
                ].map(({code,label}) => ({
                  id:code ?? "none", label, separatorBefore:code === null,
                  checked:kind === "word" && part === code,
                  trailingIcon:kind === "word" && part === code ? <Check size={14}/> : undefined,
                  onSelect:() => choosePart(code)
                })),
              ]}
            />
          )}
        </header>
        <div className={`${s.scroll} ${surfaces.readingRegion}`}>
          {senses.map((sense, i) => (
            <React.Fragment key={sense.key}>
              <article
                className={`${surfaces.card} ${s.card}`}
                lang={languageCode}
              >
                <span className={`absolute ${surfaces.ordinal}`}>{i + 1}</span>
                <div
                  className={`${surfaces.frameExposure} ${s.status}`}
                  lang={interfaceLanguage}
                >
                  {sense.dirty || headerDirty ? copy.draft : copy.saved}
                  {i > 0 && !sense.entryId && (
                    <button
                      type="button"
                      aria-label={copy.removeMeaning}
                      className={s.mini}
                      onClick={() => {
                        edit();
                        setSenses((current) =>
                          current.filter((x) => x.key !== sense.key),
                        );
                        if (chosen?.key === sense.key) toggleAssistant(null);
                      }}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
                <ProductionArticleReading>
                  <div className={reading.definitionText}>
                    <InlineText
                      value={sense.definition}
                      placeholder={copy.definition}
                      label={copy.editDefinition}
                      autoEdit={sense.fresh}
                      onChange={(value) =>
                        changeSense(sense.key, { definition: value })
                      }
                    />
                  </div>
                  {translated && canTranslate && sense.definition.trim() && (
                    <PersonalDraftTranslation
                      word={word}
                      definition={sense.definition}
                      locale={interfaceLanguage}
                      language={translationLanguage!}
                    />
                  )}
                  {(
                    [
                      "synonym",
                      "example",
                      "expression",
                      "note",
                      "reference",
                    ] as const
                  ).map((kind) => {
                    const fields = sense.fields.filter((f) => f.kind === kind);
                    if (!fields.length) return null;
                    return (
                      <PersonalFieldGroup
                        key={kind}
                        kind={kind}
                        locale={interfaceLanguage}
                        copy={copy}
                      >
                        {fields.map((field) => (
                          <PersonalCardField
                            key={field.key}
                            field={field}
                            copy={copy}
                            locale={interfaceLanguage}
                            languageCode={languageCode}
                            change={(next) =>
                              changeSense(sense.key, {
                                fields: sense.fields.map((f) =>
                                  f.key === field.key ? next : f,
                                ),
                              })
                            }
                            remove={() =>
                              changeSense(sense.key, {
                                fields: sense.fields.filter(
                                  (f) => f.key !== field.key,
                                ),
                              })
                            }
                          />
                        ))}
                      </PersonalFieldGroup>
                    );
                  })}
                </ProductionArticleReading>
                <div className={s.actions} lang={interfaceLanguage}>
                  {sense.entryId && !sense.dirty && !headerDirty ? (
                    <button type="button" className={actions.primary} onClick={() => {toggleAssistant(null); onRead(sense.entryId!);}}>
                      {copy.read}
                    </button>
                  ) : <button
                    type="button"
                    className={actions.primary}
                    disabled={!ready(sense) || busy}
                    onClick={() => void save(sense)}
                  >
                    {busy ? copy.saving : copy.save}
                  </button>}
                  {assistantAvailable && <button
                    type="button"
                    className={actions.primary}
                    onClick={(e) => {
                      askButton.current = e.currentTarget;
                      toggleAssistant(sense.key);
                    }}
                  >
                    <Sparkles size={15} />
                    {copy.ask}
                  </button>}
                </div>
              </article>
              <footer className={s.footer} lang={interfaceLanguage}>
                {i === senses.length - 1 && (
                  <AddAction
                    onClick={() => {
                      edit();
                      setSenses((current) => [
                        ...current,
                        { ...draftSense({ definition: "" }), fresh: true },
                      ]);
                    }}
                  >
                    {copy.another}
                  </AddAction>
                )}
                <span className={s.spacer} />
                <AddData
                  choices={kinds}
                  copy={copy}
                  locale={interfaceLanguage}
                  moreItems={
                    sense.entryId
                      ? [
                          {
                            id: "move",
                            label: copy.move,
                            disabled: hasUnsaved,
                            onSelect: () => setMoveTarget(sense),
                          },
                          ...(senses.length > 1
                            ? [
                                {
                                  id: "detach",
                                  label: copy.detach,
                                  disabled: hasUnsaved,
                                  onSelect: () => void move(sense, null),
                                },
                              ]
                            : []),
                        ]
                      : []
                  }
                  onSelect={(kind) =>
                    changeSense(sense.key, {
                      fields: [
                        ...sense.fields,
                        draftField({ kind, text: "" }, true),
                      ],
                    })
                  }
                />
              </footer>
            </React.Fragment>
          ))}
          {failed && (
            <p role="alert" className={s.error}>
              {copy.error}
            </p>
          )}
        </div>
        </div>
        {mobile && deleteDraft && (
          <footer className={s.draftFooter}>{deleteDraft}</footer>
        )}
      </fieldset>
      {moveTarget?.entryId && (
        <PersonalMoveDialog
          sourceId={moveTarget.entryId}
          word={word}
          definition={moveTarget.definition}
          copy={copy}
          busy={busy}
          onClose={() => {
            if (!busy) setMoveTarget(null);
          }}
          onMove={(id) => void move(moveTarget, id)}
        />
      )}
      {panelHost && assistantPanel
        ? createPortal(assistantPanel, panelHost)
        : assistantPanel}
    </section>
  );
}
