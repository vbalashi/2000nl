"use client";
import React from "react";
import { useSearchParams } from "next/navigation";
import { ProductionArticleReading } from "@/components/practice/article/ProductionArticleReading";
import {
  ArticleMeaningDetails,
  ArticleContentNode,
} from "@/components/practice/article/ArticleContent";
import { TrainingIdiomCard } from "@/components/training/pilot/TrainingIdiomCard";
import { accountTextSizeStyles } from "@/lib/reading/textScale";
import {
  cardSpacingStyles,
  type CardSpacing,
} from "@/components/practice/ui/cardSpacing";
import theme from "@/components/practice/ui/practiceTheme.module.css";
import type { PlatformV2SenseContentNode } from "@/lib/platform/projections/platformV2SenseContent";
import type { IdiomExerciseContent } from "@/lib/training/idiomExerciseContent";
import type { PlatformIdiomExerciseCandidateV2 } from "../../../../../packages/shared/types/platformV2";
import { richGroup } from "../card-spacing-proof/fixtures";
import { russianAuditTranslations } from "../card-spacing-proof/russianTranslations";
import { ArticleSenseRelations } from "@/components/practice/article/ArticleWordDetails";
import { lexicalRelationDetail } from "@/components/practice/article/wordDetailsPresentation";
import "./study.css";
const text = {
  expression: "iets gestalte geven",
  explanation: "iets uitvoeren; zorgen dat iets er komt",
  example: "de commissie gaf gestalte aan de plannen voor een nieuw beleid",
};
const ru = {
  expression: "воплотить что-либо",
  explanation: "осуществить что-либо; сделать так, чтобы что-то появилось",
  example: "комиссия воплотила планы по новой политике",
};
export function RhythmStudy() {
  const q = useSearchParams(),
    translation = q.get("translation") || "on",
    profile = (q.get("profile") || "balanced") as CardSpacing,
    size = (
      ["normal", "large", "largest", "extra"].includes(q.get("size") || "")
        ? q.get("size")
        : "normal"
    ) as "normal" | "large" | "largest" | "extra";
  const visible = translation !== "off";
  const nodes = (["expression", "explanation", "example"] as const).map(
    (role, i) => ({
      contentNodeId: `gestalte-${role}`,
      parentContentNodeId: i ? "gestalte-expression" : null,
      kind: i === 0 ? "idiom" : i === 1 ? "idiom-explanation" : "example",
      order: i,
      text: text[role],
      sourceTextFingerprint: "fixture-" + role,
      translations:
        visible && !(translation === "partial" && role === "example")
          ? [
              {
                targetLanguageCode: "ru",
                text: ru[role],
                status: "ready",
                sourceTextFingerprint: "fixture-" + role,
              },
            ]
          : [],
    }),
  );
  const content = {
    headword: "gestalte",
    article: "de",
    group: {
      groupId: "audit-gestalte",
      header: { text: "gestalte" },
      entries: [],
    },
    entry: {
      entryId: "audit-gestalte",
      kind: "sense-card",
      contentNodes: nodes,
      capabilities: [],
    },
    expression: nodes[0],
    explanation: nodes[1],
    examples: [nodes[2]],
  } as unknown as IdiomExerciseContent;
  const candidate = {
    direction: "direct",
    targetId: "audit-target",
    targetKey: "idiom:audit-target:direct",
    entryId: "audit-gestalte",
    contentNodeId: "gestalte-expression",
    sourceTextFingerprint: "fixture-expression",
  } as PlatformIdiomExerciseCandidateV2;
  const trim = (n: PlatformV2SenseContentNode): PlatformV2SenseContentNode => ({
    ...n,
    translation:
      visible && !(translation === "partial" && n.kind === "example")
        ? russianAuditTranslations[n.text]
        : undefined,
    children: n.children.map(trim),
  });
  const projected: PlatformV2SenseContentNode = {
    contentNodeId: "gestalte-expression",
    parentContentNodeId: null,
    kind: "idiom",
    text: text.expression,
    translation: visible ? ru.expression : undefined,
    children: [
      {
        contentNodeId: "gestalte-explanation",
        parentContentNodeId: "gestalte-expression",
        kind: "idiom-explanation",
        text: text.explanation,
        translation: visible ? ru.explanation : undefined,
        children: [],
      },
      {
        contentNodeId: "gestalte-example",
        parentContentNodeId: "gestalte-expression",
        kind: "example",
        text: text.example,
        translation: translation === "on" ? ru.example : undefined,
        children: [],
      },
    ],
  };
  return (
    <main
      className={theme.theme}
      data-colour-mode="light"
      data-practice-palette="indigo"
      data-rhythm={q.get("treatment") || "current"}
      data-profile={profile}
      style={{
        ...accountTextSizeStyles(size),
        ...cardSpacingStyles(profile),
        padding: 20,
        minHeight: "100dvh",
        background: "var(--practice-canvas)",
      }}
    >
      <h1 className="audit-heading">
        gestalte · {q.get("treatment") || "current"} · {profile} · {size} ·{" "}
        {translation}
      </h1>
      {q.get("fixture") === "goed" ? (
        richGroup.meanings.map((m) => (
          <article className="rhythm-article" key={m.entryId}>
            <ProductionArticleReading>
              {m.definition && (
                <ArticleContentNode
                  lead
                  node={trim(m.definition)}
                  interfaceLanguage="ru"
                  contentLanguage="nl"
                  translationLanguage="ru"
                  translationVisible={visible}
                />
              )}
              <ArticleSenseRelations
                relation={lexicalRelationDetail(m.wordDetails)}
                interfaceLanguage="ru"
                contentLanguage="nl"
              />
              <ArticleMeaningDetails
                definition={m.definition ? trim(m.definition) : null}
                details={m.details.map(trim)}
                interfaceLanguage="ru"
                contentLanguage="nl"
                translationLanguage="ru"
                translationVisible={visible}
              />
            </ProductionArticleReading>
          </article>
        ))
      ) : q.get("surface") === "training" ? (
        <div style={{ height: 850 }}>
          <TrainingIdiomCard
            userId="audit-no-account"
            content={content}
            candidate={candidate}
            contentLanguageCode="nl"
            translationTargetLanguageCode={visible ? "ru" : null}
            interfaceLanguage="ru"
            revealed
            onReveal={() => {}}
            busy={false}
            onGrade={() => {}}
          />
        </div>
      ) : (
        <article className="rhythm-article">
          <ProductionArticleReading>
            <h2>de gestalte</h2>
            <ArticleContentNode
              lead
              node={{
                contentNodeId: "gestalte-definition",
                parentContentNodeId: null,
                kind: "definition",
                text: "een lichaam zoals je het ziet",
                children: [],
              }}
              interfaceLanguage="ru"
              contentLanguage="nl"
            />
            <ArticleMeaningDetails
              definition={null}
              details={[projected]}
              interfaceLanguage="ru"
              contentLanguage="nl"
              translationLanguage="ru"
              translationVisible={visible}
            />
          </ProductionArticleReading>
        </article>
      )}
    </main>
  );
}
