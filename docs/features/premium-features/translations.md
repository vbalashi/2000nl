# Premium Features: Translations

## Architecture

Translation uses `ITranslator` plus a factory in `apps/ui/lib/translation/translationProvider.ts`.

- Default provider: OpenAI
- Fallback: DeepL
- Model default: `gpt-5.2`
- Alternate providers: DeepL and Gemini

`apps/ui/lib/translation/dictionaryMeaningTranslationCoordinator.ts` owns
provider selection, cache leasing/CAS, policy and fingerprinting. The legacy
`apps/ui/app/api/translation/route.ts` and Platform translation route are thin
authenticated adapters over that coordinator.

## Env Vars

```text
TRANSLATION_PROVIDER=openai
TRANSLATION_FALLBACK=deepl
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.2
DEEPL_API_KEY=...
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-1.5-flash
```

Azure OpenAI can be used by the `openai` provider via:
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_API_VERSION`

Gemini can be selected with `TRANSLATION_PROVIDER=gemini`. When `TRANSLATION_FALLBACK=deepl` and `DEEPL_API_KEY` is set, Gemini failures fall back to DeepL.

## Fingerprint-Based Cache Invalidation

Each translation row in `word_entry_translations` has a `source_fingerprint` derived from:
- definition items
- `word_entries.part_of_speech`
- `TRANSLATION_PIPELINE_VERSION`
- prompt fingerprint

When the fingerprint changes, the translation is regenerated on the next card view.

Prompt files:
- `apps/ui/lib/translation/prompts/openai_translation_system_v1.txt`
- `apps/ui/lib/translation/prompts/openai_translation_user_instructions_v1.txt`

## POS Codes

Dutch POS tags come from `word_entries.part_of_speech`.

| Code | Dutch label | English |
|---|---|---|
| zn | zelfstandig naamwoord | noun |
| ww | werkwoord | verb |
| bn | bijvoeglijk naamwoord | adjective |
| bw | bijwoord | adverb |
| vz | voorzetsel | preposition |
| vw | voegwoord | conjunction |
| tw | telwoord | numeral |
| vnw | voornaamwoord | pronoun |

## Translation Note Field

The OpenAI prompt asks for a short contextual `note`. It is stored in `word_entry_translations.note` for future use.

## Provider Attribution And Force Retranslate

The app persists translation metadata under `overlay.__meta`:
- `providerSelected`
- `providerUsed`
- `usedFallback`
- `primaryFailure.code`
- `primaryFailure.fingerprint`

Provider response bodies and messages are never stored or returned. The closed
failure code supports classification. The 24-hex SHA-256 prefix is derived only
from the versioned closed failure class—not from provider-controlled text—so it
supports aggregate correlation without becoming a guessing oracle.

The Translate button reflects `providerUsed`, and long-press forces re-translation.

## Troubleshooting

| Symptom | Check |
|---|---|
| Translation not updating | Compare DB fingerprint and current computed fingerprint |
| OpenAI errors | Verify API key and quota |
| Silent DeepL fallback | Check server logs and fallback config |
| POS not included | Check `word_entries.part_of_speech` |
| Old translations persist | Verify `TRANSLATION_PIPELINE_VERSION` and prompt hashes |
| `note` is NULL | Check whether the row predates the note-enabled pipeline |

## DB Queries

```sql
select word_entry_id, provider, status, source_fingerprint, note, error_message
from word_entry_translations
where word_entry_id = '<uuid>' and target_lang = 'ru';

select status, count(*) from word_entry_translations group by status;

select * from word_entry_translations where status in ('pending', 'error') limit 20;
```

## Key Files

| Purpose | Path |
|---|---|
| Translation coordinator | `apps/ui/lib/translation/dictionaryMeaningTranslationCoordinator.ts` |
| Legacy translation adapter | `apps/ui/app/api/translation/route.ts` |
| Platform translation adapter | `apps/ui/app/api/platform/translation/route.ts` |
| Translation provider factory | `apps/ui/lib/translation/translationProvider.ts` |
| OpenAI translator | `apps/ui/lib/translation/openaiTranslator.ts` |
| Gemini translator | `apps/ui/lib/translation/geminiTranslator.ts` |
| DeepL translator | `apps/ui/lib/translation/deeplTranslator.ts` |
| Bulk re-translate script | `apps/ui/scripts/retranslate-translations.js` |
