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
  [`apps/ui/scripts/eval-translation-prompt.ts`](../../apps/ui/scripts/eval-translation-prompt.ts)
  and
  [`apps/ui/scripts/translationEvalCases.ts`](../../apps/ui/scripts/translationEvalCases.ts).
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

## Product-reviewed contract decision

| Decision | Approved v1 |
| --- | --- |
| Scope of structured alternatives | Entry-level only for the first slice; node translations remain one contextual text. |
| Alternative value shape | Ordered, deduplicated `string[]`; always present, with `[]` preferred to invented variants. Alternatives are model-generated derived data even when the source has none. |
| `literal` versus `base` | Use `baseText` for the entry-level context-free headword rendering; keep `literalTranslatedText` confined to selected-fragment translation. |
| Entry text for idiom-only meanings | Allow entry translation to be unavailable; translate exact idiom nodes. |
| Public TDD seam | A pure versioned request builder + strict response parser used by both `OpenAITranslator` and the eval runner. |

The owner approved this package on 2026-08-13 with the clarification that the
model should consider additional headword translations even when the source
contains none. The resulting Translation Artifact remains separate from source
dictionary content.

## Three-sense tracer result

The current production contract was run first, before changing prompts. The
same private Azure GPT-4.1 deployment then ran the approved meaning contract.
No database writes or bulk translation occurred; detailed run artifacts stayed
in `/tmp`.

| `goed` noun sense | Existing production primary | Meaning-v1 primary | Meaning-v1 alternatives |
| --- | --- | --- | --- |
| things/goods | `товар` | `товар` | `[]` |
| moral good | `добро` | `добро` | `[]` |
| cloth/clothes | `бельё` | `бельё` | `[]` |

All three outputs preserved their required sense and avoided the two forbidden
senses recorded per fixture. Meaning-v1 returned the required structured array
for every entry. Empty arrays are a successful result here: the model considered
alternatives but did not invent weaker variants. Because the baseline already
had good semantic fidelity, the new prompt stays focused on exact meaning
binding and response structure instead of adding a large corrective checklist.

## Advisory handoff assessment

The supplied handoff correctly identifies eval/production drift, recommends
separate deterministic/fidelity/naturalness/context judging, and keeps
translation evaluation separate from #143. Its proposed 72-case benchmark,
model tournament, locked holdout, budgets, and human blind UI are useful later
phases, not prerequisites for the first three-sense contract tracer. The
handoff is prior-agent advice rather than a primary source:
`/tmp/2000nl-translation-prompt-eval-handoff-2026-08-13.md`.
