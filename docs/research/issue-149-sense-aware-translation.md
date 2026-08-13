# Issue 149: sense-aware translation contract research

Date: 2026-08-13

## Question

What is the smallest production-aligned contract and evaluation slice that can
distinguish translations of exact Dictionary Meanings, especially the noun
senses of `goed`, without overlapping the clean-room dictionary-entry generator
in #143?

## Primary-source findings

### Identity and ownership are already decided

- A **Dictionary Meaning** is one learnable sense and is owned by `entryId`.
  Related definitions, Usage Patterns, examples, idioms, and notes are part of
  that meaning. A **Content Node** is a stable semantic element within it. See
  [`CONTEXT.md`](../../CONTEXT.md).
- ADR 0004 requires derived translations to be bound by entry/node identity and
  source fingerprints; paths and array indexes are diagnostics, not identity.
  See
  [`docs/adr/0004-sensecard-presentation-contract-boundary.md`](../adr/0004-sensecard-presentation-contract-boundary.md).
- Platform V2 currently exposes one optional `text` per entry translation and
  one optional `text` per Content Node translation. It has no structured
  alternatives or literal/base field. See
  [`packages/shared/types/platformV2.ts`](../../packages/shared/types/platformV2.ts).
- #70 records the required ownership pipeline and says translation feedback
  identifies `entryId` and, where relevant, `contentNodeId`/`translationId`.
  Its merged producer work already stores and checks
  `source_content_revision`, `translation_policy_version`, and
  `provider_revision`. See [2000nl #70](https://github.com/vbalashi/2000nl/issues/70).

### Production translates a positional text batch, not an exact meaning contract

- `extractTranslatableTexts` flattens the headword, first meaning definition,
  context, examples, and idiom expression/explanation into `{path, text}` items.
  The headword is combined with `de`/`het`, but field role, `entryId`,
  `contentNodeId`, Usage Pattern, and stable semantic identity are not passed to
  the model. See
  [`apps/ui/lib/translation/extractTranslatableTexts.ts`](../../apps/ui/lib/translation/extractTranslatableTexts.ts).
- The dictionary route calls the translator with only POS label/code. It does
  not pass `sourceLanguageCode`, `purpose`, or a whole-meaning `contextText`.
  It stores only `result.translations`; `literalTranslations` are discarded.
  See
  [`apps/ui/app/api/translation/route.ts`](../../apps/ui/app/api/translation/route.ts).
- Cache freshness already checks both normalized source content and translation
  policy. Prompt files participate through a prompt fingerprint. This is the
  right invalidation mechanism, provided the eventual meaning payload and
  response-policy version are included. See
  [`apps/ui/lib/translation/translationPolicy.ts`](../../apps/ui/lib/translation/translationPolicy.ts)
  and
  [`apps/ui/lib/translation/prompts/promptFingerprint.ts`](../../apps/ui/lib/translation/prompts/promptFingerprint.ts).

### The existing eval has drifted from production

- Production sends `targetLanguageCode`, `commentLanguage`,
  `sourceLanguageCode`, `purpose`, `partOfSpeech`, `partOfSpeechCode`, `texts`,
  `contextText`, and a response shape containing `translations`,
  `literalTranslations`, and `note`. Its parser accepts missing or wrong-length
  literal translations instead of failing closed. See
  [`apps/ui/lib/translation/openaiTranslator.ts`](../../apps/ui/lib/translation/openaiTranslator.ts).
- The eval duplicates message building, parsing, and extraction. It omits the
  production source language, purpose, context, literal response field, and
  literal parsing. Its three fixtures contain no `goed` senses. See
  [`apps/ui/scripts/eval-translation-prompt.js`](../../apps/ui/scripts/eval-translation-prompt.js)
  and
  [`apps/ui/scripts/translation-eval-cases.js`](../../apps/ui/scripts/translation-eval-cases.js).
- Therefore prompt comparison is not trustworthy until production and eval use
  one versioned, testable message/parser seam.

### A minimal real-corpus `goed` evaluation is available

The local imported corpus contains these distinct noun Dictionary Meanings,
all with headword `goed`, article `het`, and POS `zn`:

| Sense | Definition | Example | Evaluation requirement |
| --- | --- | --- | --- |
| goods/things | `de dingen; de voorwerpen` | `de goederen worden vervoerd per schip` | convey goods/items/objects; reject moral “good” and adjective “good” |
| the good | `dat wat goed is` | `zij heeft veel goed gedaan voor de stad` | convey good/benefit; reject goods/merchandise and clothing |
| cloth/clothes | `de stof; de kleren` | `het vuile goed kun je in de machine doen` | convey clothes/laundry/textile in context; reject moral “good” and merchandise |

This is a better first fixture than exact-string gold: each case should carry
acceptable renderings, required semantic units, and forbidden senses. The
cases must remain grouped by source article for later train/validation splits.

### #143 is a separate bounded context

#143 generates original Dutch learner dictionary entries from clean-room input
and uses protected dictionary material only in a local evaluation boundary.
#149 translates existing, identified dictionary meaning content into a target
language and persists a derived translation artifact. The evaluation mechanics
may inspire provenance and blind comparison, but generator inputs, prompts,
schemas, fixtures, and outputs must not be reused as the translation contract.
See [2000nl #143](https://github.com/vbalashi/2000nl/issues/143) and
[PR #144](https://github.com/vbalashi/2000nl/pull/144).

## Domain-model stress tests

1. Two entries have the same headword and POS but different definitions and
   examples. A result is sense-aware only if its preferred rendering can differ
   by `entryId`; POS-only disambiguation is insufficient.
2. An entry has no definition and only an idiom. The contract must decide
   whether an entry-level headword translation exists, or only node-bound idiom
   translations do.
3. Two equally valid target renderings differ only by register or learner
   usefulness. The contract must decide whether alternatives are bare strings
   or carry semantic metadata.
4. A definition changes while the visible headword does not. The artifact must
   become stale through `sourceContentFingerprint`; a prompt/output policy
   change must invalidate it through `translationPolicyVersion`.
5. Library and Training request the same entry and target language. They must
   receive the same stored artifact and may only choose presentation, not infer
   alternatives by splitting punctuation.

## Contract decisions still required from product review

| Decision | Why it blocks TDD/prompt changes | Recommended default |
| --- | --- | --- |
| Scope of structured alternatives | It is unclear whether alternatives belong only to the entry/headword translation or to every Content Node translation. | Entry-level only for the first slice; node translations remain one contextual text. |
| Alternative value shape | `string[]` is sufficient for rendering, but cannot express register, preference reason, or provenance per alternative. | Start with ordered, deduplicated `string[]`; add metadata only for a demonstrated UX need. |
| `literal` versus `base` | Existing selected-fragment translation defines literal as context-free; a dictionary headword “base” rendering is a different concept. The issue uses `literal/base` without choosing one. | Use `baseText` for the entry-level context-free headword rendering; keep `literalTranslatedText` semantics confined to selected-fragment translation. |
| Entry text for idiom-only meanings | Deriving a headword translation from an idiom may fabricate an entry sense. | Allow entry translation to be unavailable; translate exact idiom nodes. |
| Public TDD seam | Tests must target a stable public interface shared by production and eval. | A pure versioned request builder + strict response parser used by both `OpenAITranslator` and the eval runner. |

Until these choices are accepted, changing prompts would optimize against an
unstable response contract. The safe next step is product review, followed by
one red-green slice for the shared request/parser seam and the three-case `goed`
fixture before any prompt edit.

## Advisory handoff assessment

The supplied handoff correctly identifies eval/production drift, recommends
separate deterministic/fidelity/naturalness/context judging, and keeps
translation evaluation separate from #143. Its proposed 72-case benchmark,
model tournament, locked holdout, budgets, and human blind UI are useful later
phases, not prerequisites for the first three-sense contract tracer. The
handoff is prior-agent advice rather than a primary source:
`/tmp/2000nl-translation-prompt-eval-handoff-2026-08-13.md`.
