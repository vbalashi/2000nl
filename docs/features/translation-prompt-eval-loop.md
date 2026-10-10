# Translation Prompt Eval Loop (Lean Iteration)

This repo uses an LLM-based translation pipeline (default provider: OpenAI). Translation quality is prompt-sensitive, and bad outputs are hard to debug without a tight feedback loop.

This note describes the intended loop:
1. Translate a small, curated set of tricky words/examples (fixtures).
2. Have a separate agent (LLM judge) assess the output against a rubric.
3. Tune the prompt files.
4. Rerun until results are consistently acceptable.

The goal is fast iteration with minimal DB/UI involvement.

## Dictionary Meaning Translation V1

Dictionary overlays use `dictionary-meaning-translation-v1`. The request binds
one exact `entryId` and `sourceContentFingerprint` to a bounded headword,
definition, Usage Pattern, examples, idioms, explanations, and notes payload.
Each content item has a semantic role and stable request-local `fieldId`.
The contract applies explicit item, per-field, aggregate character, and
conservative UTF-8 byte/token upper bounds to every dynamic request string;
language codes are normalized and allowlisted by shape.

The strict response separates the entry rendering from translations of its
content:

```json
{
  "entryTranslation": {
    "primaryText": "бельё",
    "alternativeTexts": ["одежда", "текстиль"],
    "baseText": "товар",
    "note": "Здесь имеется в виду одежда для стирки."
  },
  "contentTranslations": [
    { "fieldId": "definition", "text": "ткань; одежда" }
  ]
}
```

`alternativeTexts` contains model-generated additional headword renderings,
not source-dictionary synonyms. The field is always present; `[]` means the
model found no additional high-quality equivalent. Source content is never
modified. Library and Training consume the same stored Platform V2 artifact
and may render the array with an approved separator.

For an idiom-only source meaning (at least one idiom, with no definition or
Usage Pattern), production deterministically stores `entryTranslation: null`
even if a provider invents a headword-level result. Exact idiom, explanation,
and example translations remain in `contentTranslations`.
Only idiom-only artifacts use the revised pipeline identity; existing current
artifacts for ordinary meanings remain fresh and are not regenerated.

The legacy selected-fragment contract remains separate. Its
`literalTranslatedText` means a fragment translated without surrounding text;
dictionary `baseText` is a context-free headword rendering.

## Where The OpenAI Prompt Lives

The OpenAI translator builds chat messages in code, but the editable prompt text is now split into standalone files:

- System prompt: `apps/ui/lib/translation/prompts/openai_translation_system_v1.txt`
- User instructions: `apps/ui/lib/translation/prompts/openai_translation_user_instructions_v1.txt`

The user message is a JSON payload (target language, POS, input texts, expected response format).

## Separate dictionary translation research

The current reproducible workspace is [Research/translation-eval](../../Research/translation-eval/README.md).
It freezes cases, candidate prompts, model settings, source snapshots, attempts,
responses, usage and latency; reviews are stored separately from generation.
Development and held-out validation suites are separate. GPT-4.1, Luna 5.6 and
Luna 6 have distinct credential profiles. See its rubric and CLI commands.
This workspace does not change the runtime prompt or article generation pipeline.

The older `apps/ui/scripts/translationEvalCases.ts` and `eval:translation`
runner remain useful diagnostics (including `--meaning-contract --dry-run`).
They do not implement the proposed LLM judge or a `--min-score` quality gate.
Do not interpret successful translation execution as semantic approval.

## Cache Invalidation / Prompt Fingerprint

The dictionary-meaning translation coordinator caches translations per
`(word_entry_id, target_lang, provider)` and uses a fingerprint to decide
whether to retranslate. HTTP routes only authenticate, authorize the requested
entry, and adapt the coordinator result.

Each translation contract has its own prompt hash. Dictionary-meaning prompt
edits invalidate dictionary artifacts, while selected-fragment prompt edits do
not cause paid regeneration of unrelated dictionary translations (and vice
versa):
- `apps/ui/lib/translation/dictionaryMeaningTranslationCoordinator.ts`
- `apps/ui/lib/translation/prompts/promptFingerprint.ts`

Outcome:
- Changing the dictionary prompt fingerprint makes old artifacts stale. Refresh requires the next explicit translation request; read-only lookup/card display does not itself guarantee paid regeneration.

## Optional: Bulk Backfill After Prompt Changes

If you want to regenerate a lot of cached translations immediately, use:
- `apps/ui/scripts/retranslate-translations.js`

This script also loads `OPENAI_API_KEY` from `.env.local` by default.

## Future Extensions (If Needed)

Keep the loop lean, but these are natural next steps if prompt-tuning becomes frequent:
- Add a "golden" expected-output field per case, plus fuzzy matching, to reduce dependence on the judge model.
- Add a small UI page that shows the eval set and diffs across prompt versions.
- Add "provider attribution" on the card UI (DB already stores `word_entry_translations.provider`).
