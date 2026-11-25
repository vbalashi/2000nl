"use client";
import React from "react";
import { PersonalReferencePicker } from "./PersonalReferencePicker";
import reading from "@/components/practice/article/articleContent.module.css";
import relations from "@/components/practice/article/wordDetails.module.css";
import { getUiMessages } from "@/lib/uiMessages";
import { List, Quote, Link2, Pencil, X } from "lucide-react";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/components/practice/ui/ActionMenu";
import { AddAction } from "@/components/practice/ui/AddAction";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { PersonalField } from "@/lib/training/personalArticleClient";
import type { PersonalCardCopy } from "./personalCardCopy";
import s from "./personalDictionaryEntryDraft.module.css";

export function InlineText({
  value,
  placeholder,
  label,
  onChange,
  autoEdit = false,
  extra,
}: {
  value: string;
  placeholder: string;
  label: string;
  onChange: (next: string) => void;
  autoEdit?: boolean;
  extra?: React.ReactNode;
}) {
  const [editing, setEditing] = React.useState(autoEdit);
  const original = React.useRef(value);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const text = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);
  const start = () => {
    original.current = value;
    setEditing(true);
  };
  return (
    <span className={s.inline} data-editing={editing || undefined}>
      <span className={s.inlinePreview}>
        <span className={value ? undefined : s.placeholder} ref={text} tabIndex={-1} onClick={start}>
          {value || placeholder}
        </span>
        <button type="button" className={s.mini} aria-label={label} onClick={start}>
          <Pencil size={13} />
        </button>
        {extra}
      </span>
      {editing && (
        <textarea rows={1} ref={ref} aria-label={label} className={s.input}
          value={value} placeholder={placeholder}
          onChange={event => onChange(event.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing || !["Enter","Escape"].includes(event.key)) return;
            event.preventDefault();
            if (event.key === "Escape") onChange(original.current);
            setEditing(false);
            requestAnimationFrame(() => text.current?.focus({preventScroll:true}));
          }}
        />
      )}
    </span>
  );
}
export function AddData<T extends string>({
  choices,
  copy,
  locale,
  onSelect,
  moreItems = [],
}: {
  moreItems?: ActionMenuItem[];
  choices: readonly T[];
  copy: PersonalCardCopy;
  locale: OnboardingLanguage;
  onSelect: (choice: T) => void;
}) {
  const [anchor, setAnchor] = React.useState<HTMLButtonElement | null>(null);
  return (
    <>
      <AddAction
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
      >
        {copy.more}
      </AddAction>
      {anchor && (
        <ActionMenu
          anchor={anchor}
          title={copy.more}
          language={locale}
          onClose={() => {
            setAnchor(null);
            anchor.focus();
          }}
          items={[
            ...choices.map((kind) => ({
              id: kind,
              label: copy[kind as keyof PersonalCardCopy],
              onSelect: () => {
                setAnchor(null);
                onSelect(kind);
              },
            })),
            ...moreItems.map((item) => ({
              ...item,
              onSelect: () => {
                setAnchor(null);
                item.onSelect();
              },
            })),
          ]}
        />
      )}
    </>
  );
}
export type DraftField = Omit<PersonalField, "children"> & {
  key: string;
  fresh?: boolean;
  children?: {
    key: string;
    kind: "example" | "explanation";
    text: string;
    fresh?: boolean;
  }[];
};
export const draftField = (
  field: PersonalField,
  fresh = false,
): DraftField => ({
  ...field,
  key: crypto.randomUUID(),
  fresh,
  children: field.children?.map((child) => ({
    ...child,
    key: crypto.randomUUID(),
  })),
});
export const fieldPayload = ({
  kind,
  text,
  children,
  targetEntryId,
}: DraftField): PersonalField => ({
  kind,
  text: text.trim(),
  ...(kind === "reference" && targetEntryId ? { targetEntryId } : {}),
  ...(children?.length
    ? { children: children.map((c) => ({ kind: c.kind, text: c.text.trim() })) }
    : {}),
});
const sectionName = {
  example: "examples",
  note: "notes",
  expression: "expressions",
  reference: "references",
  synonym: "synonyms",
} as const;
export function PersonalFieldGroup({
  kind,
  locale,
  children,
  copy,
}: {
  kind: PersonalField["kind"];
  locale: OnboardingLanguage;
  children: React.ReactNode;
  copy: PersonalCardCopy;
}) {
  const ui = getUiMessages(locale);
  if (kind === "synonym")
    return (
      <section className={relations.sense}>
        <div className={relations.relations}>
          <div className={relations.relationGroup} data-kind="synonyms">
            <h3>
              <Link2 size={12} />
              <span>{ui.wordDetails.synonyms}</span>
            </h3>
            <p>{children}</p>
          </div>
        </div>
      </section>
    );
  const label =
    kind === "note"
      ? ui.article.note
      : kind === "expression"
        ? ui.article.expressions
        : kind === "example"
          ? ui.article.examples
          : copy.reference;
  return (
    <section
      className={reading.contentSection}
      data-section={sectionName[kind]}
    >
      <h3>
        {kind === "example" ? (
          <List size={12} />
        ) : kind === "reference" ? (
          <Link2 size={12} />
        ) : (
          <Quote size={12} />
        )}
        <span>{label}</span>
      </h3>
      {children}
    </section>
  );
}
export function PersonalCardField({
  field,
  copy,
  locale,
  languageCode,
  change,
  remove,
}: {
  field: DraftField;
  languageCode: string;
  copy: PersonalCardCopy;
  locale: OnboardingLanguage;
  change: (field: DraftField) => void;
  remove: () => void;
}) {
  const children = field.children ?? [];
  const removeButton = (label: string, action: () => void) => (
    <button
      type="button"
      className={s.mini}
      aria-label={copy.remove + " · " + label}
      onClick={action}
    >
      <X size={13} />
    </button>
  );
  const editable = (
    <InlineText
      value={field.text}
      placeholder={copy[field.kind]}
      label={copy.edit + " · " + copy[field.kind]}
      autoEdit={field.fresh}
      onChange={(text) => change({ ...field, text })}
      extra={removeButton(copy[field.kind], remove)}
    />
  );
  if (field.kind === "synonym")
    return <span className={s.synonym}>{editable}</span>;
  const kind =
    field.kind === "expression"
      ? "idiom"
      : field.kind === "note"
        ? "usage-note"
        : field.kind;
  const ordered = [...children].sort(
    (a, b) => Number(a.kind === "example") - Number(b.kind === "example"),
  );
  return (
    <div
      className={`${reading.contentNode} ${s.reveal}`}
      data-content-kind={kind}
      data-kind={kind}
    >
      <div className={reading.contentPair}>
        {field.kind === "reference" ? (
          <PersonalReferencePicker
            text={field.text}
            locale={locale}
            languageCode={languageCode}
            label={copy.reference}
            onChoose={(text, targetEntryId) =>
              change({ ...field, text, targetEntryId })
            }
            remove={removeButton(copy.reference, remove)}
          />
        ) : (
          <p
            className={
              field.kind === "note" ? reading.explanation : reading.literary
            }
            lang={languageCode}
          >
            {editable}
          </p>
        )}
      </div>
      {field.kind === "expression" && !field.text.trim() && children.some(child => child.text.trim()) && <p role="status" className={s.error}>{copy.missingExpression}</p>}
      {field.kind === "expression" && (
        <>
          {ordered.length > 0 && (
            <div className={reading.children}>
              {ordered.map((child) => (
                <div
                  key={child.key}
                  data-kind={
                    child.kind === "explanation"
                      ? "idiom-explanation"
                      : "example"
                  }
                  className={`${reading.contentNode} ${s.reveal}`}
                >
                  <div className={reading.contentPair}>
                    <span className={reading.nodeRole} data-role={child.kind}>
                      {copy[child.kind]}
                    </span>
                    <p
                      className={
                        child.kind === "example"
                          ? reading.literary
                          : reading.explanation
                      }
                      lang={languageCode}
                    >
                      <InlineText
                        value={child.text}
                        placeholder={copy[child.kind]}
                        autoEdit={child.fresh}
                        label={copy.edit + " · " + copy[child.kind]}
                        onChange={(text) =>
                          change({
                            ...field,
                            children: children.map((c) =>
                              c.key === child.key ? { ...c, text } : c,
                            ),
                          })
                        }
                        extra={removeButton(copy[child.kind], () =>
                          change({
                            ...field,
                            children: children.filter(
                              (c) => c.key !== child.key,
                            ),
                          }),
                        )}
                      />
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <AddData
            choices={["example", "explanation"] as const}
            copy={copy}
            locale={locale}
            onSelect={(kind) =>
              change({
                ...field,
                children: [
                  ...children,
                  { key: crypto.randomUUID(), kind, text: "", fresh: true },
                ],
              })
            }
          />
        </>
      )}
    </div>
  );
}
