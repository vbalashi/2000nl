# Independent full-card translation languages

Owner decision: [2026-10-16 discussion](../discussions/2026-10-16-01-secondary-card-translation.md). Owning issue: [#716](https://github.com/vbalashi/2000nl/issues/716).

Settings has two independent Off/language controls. The existing primary preference keeps its legacy English default and explicit `off` sentinel. The additional preference is nullable `user_settings.secondary_translation_lang`, disabled by default. Neither setting forces the other on. Identical enabled languages render once.

The additional language is consumed only inside full-card answer/Library presentation. It does not enter training setup, question/hint construction, reverse renderability, scheduling, progress actions, external-client defaults, or session identity. Settings persists only the changed column, preserving the other language and unrelated account preferences.

Full-card translations retain the existing reveal control. An additional read-only `dictionary-lookup` projection loads after reveal and uses the existing server translation capability/preparation observer. Ready primary text remains visible during additional loading/failure. Per-language retry cannot change the prompt. Node and lexical-relation translations match exact identities and source fingerprints; changing account, entry or additional language cancels old observations. Translations are not copied from provider raw data.

## Local validation and owner preview

Use the local QA runbook and port 3100. Apply contract 226 through the repository local database wrapper; this is an additive nullable preference column, with existing RLS retained. The new SQL probe tests authenticated own-account writes, secondary-only, both-off and foreign-account isolation inside a rolled-back transaction:

```sh
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -v ON_ERROR_STOP=1 -f db/deploy-contract/secondary-translation-preference-probe.sql
```

The small existing `huis` and `fiets` dictionary fixtures can receive deterministic bilingual cached translations, without credentials or provider calls:

```sh
cd apps/ui
./node_modules/.bin/vite-node --config vitest.config.ts scripts/qa/seed-secondary-translation-preview.ts
```

This seed connects only to local port 54322 and refuses anything other than the marked local fixture. It computes current source/policy identities through the production builders. It proves real authenticated lookup/cache presentation, not external model generation quality or latency.

Owner preview: dev test-login on the same local origin, Settings → Languages, primary Russian/additional English, Library → `huis` → translation button. Screenshots and transient QA evidence are retained in the issue worktree's ignored `tmp/716/` directory. Review before merge/release; no production deployment is part of this checkpoint.
