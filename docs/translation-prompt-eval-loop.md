# Translation Prompt Eval Loop (Lean Iteration)

This repo uses an LLM-based translation pipeline (default provider: OpenAI). Translation quality is prompt-sensitive, and bad outputs are hard to debug without a tight feedback loop.

This note describes the intended loop:
1. Translate a small, curated set of tricky words/examples (fixtures).
2. Have a separate agent (LLM judge) assess the output against a rubric.
3. Tune the prompt files.
4. Rerun until results are consistently acceptable.

The goal is fast iteration with minimal DB/UI involvement.

## Where The OpenAI Prompt Lives

The OpenAI translator builds chat messages in code, but the editable prompt text is now split into standalone files:

- System prompt: `apps/ui/lib/translation/prompts/openai_translation_system_v1.txt`
- User instructions: `apps/ui/lib/translation/prompts/openai_translation_user_instructions_v1.txt`

The user message is a JSON payload (target language, POS, input texts, expected response format).

## Why A Judge Agent?

Prompt changes are easy to make but hard to validate. Manual review is slow and inconsistent.

A separate "judge" agent provides:
- A repeatable rubric (sense disambiguation, negation handling, idioms not literal, no hallucinated meanings).
- A numeric score (0-100) and pass/fail to gate changes.
- Concrete issue lists and suggested prompt tweaks.

This is not a perfect oracle, but it makes iteration much faster and creates an audit trail (JSONL logs).

## The Scripted Loop

### Fixtures (What We Translate)

Curated cases live in:
- `apps/ui/scripts/translation-eval-cases.js`

These should include known-problematic items (examples from backlog):
- POS disambiguation: `vaak` (adverb) vs article noise (`de vaak`)
- Negative-context verbs: `hoeven` ("don’t need to") vs misleading primary sense
- Idioms: `Het is hier kermis!` should be idiomatic (ruckus/chaos), not literal "fair"

Add more cases whenever a user reports a bad translation.

### Runner (Translate + Judge)

Run:
```bash
node apps/ui/scripts/eval-translation-prompt.js --case hoeven_negative_context
```

Useful flags:
```bash
--min-score 85
--log-jsonl /tmp/translation-eval.jsonl
--case <id>
```

Env:
- `OPENAI_API_KEY` is loaded from `.env.local` by default (repo root or `apps/ui/.env.local`)
- Optional: `OPENAI_MODEL`, `OPENAI_API_URL`, `OPENAI_JUDGE_MODEL`

Notes:
- If the OpenAI account has no quota, you will get `429 insufficient_quota`.
- Translation uses `temperature=0` for stability; judging also uses `temperature=0`.

### Iterate

1. Edit prompt files:
   - `apps/ui/lib/translation/prompts/openai_translation_system_v1.txt`
   - `apps/ui/lib/translation/prompts/openai_translation_user_instructions_v1.txt`
2. Re-run `apps/ui/scripts/eval-translation-prompt.js`.
3. Repeat until the weakest cases pass and the average score is acceptable.

Keep changes small and targeted:
- Add explicit guidance for idioms (prefer equivalent idiom or natural paraphrase).
- Add explicit guidance about negation and modal verbs (`hoeven`).
- Add explicit guidance about POS usage (do not invent a different POS).

## Cache Invalidation / Prompt Fingerprint

The translation API route caches translations per `(word_entry_id, target_lang, provider)` and uses a fingerprint to decide whether to retranslate.

We include a prompt hash in the fingerprint, so edits to the OpenAI prompt files automatically invalidate cached translations:
- `apps/ui/app/api/translation/route.ts`
- `apps/ui/lib/translation/prompts/promptFingerprint.ts`

Outcome:
- Changing the prompt files will cause translations to refresh naturally on next card view (no manual DB deletion).

## Optional: Bulk Backfill After Prompt Changes

If you want to regenerate a lot of cached translations immediately, use:
- `apps/ui/scripts/retranslate-translations.js`

This script also loads `OPENAI_API_KEY` from `.env.local` by default.

## Future Extensions (If Needed)

Keep the loop lean, but these are natural next steps if prompt-tuning becomes frequent:
- Add a "golden" expected-output field per case, plus fuzzy matching, to reduce dependence on the judge model.
- Add a small UI page that shows the eval set and diffs across prompt versions.
- Add "provider attribution" on the card UI (DB already stores `word_entry_translations.provider`).

