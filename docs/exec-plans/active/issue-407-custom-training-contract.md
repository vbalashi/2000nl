# Custom Training: execution contract and rollout

Status: in progress under [#407](https://github.com/vbalashi/2000nl/issues/407). The selected Pen design is `/Users/khrustal/dev/pens/2000nl-audiofilms.pen` (mobile `P6kz3B`, tablet `CU54T`, desktop `w06SdQ`). Exercise family remains single-choice; an Advanced mixed-family mode is deferred.

## Immediate vertical slice: review/new rhythm

One seven-stop control replaces independent queue toggles and the ratio buttons:

| Stop, left to right | Session card filter | Target reviews per new card |
| --- | --- | --- |
| Reviews only | `review` | irrelevant |
| 1 new after 5 reviews | `both` | 5 |
| 1 new after 4 reviews | `both` | 4 |
| 1 new after 3 reviews | `both` | 3 |
| 1 new after 2 reviews | `both` | 2 |
| 1 new after 1 review | `both` | 1 |
| New only | `new` | irrelevant |

This is an ordering preference, not an exact composition promise: finite session size, daily limits, and exhausted categories can change the actual count. `All due today` remains a separate size choice that forces Reviews only; moving the rhythm slider right restores a finite size.

The existing setup draft persists `newReviewRatio` to the language-specific scope, but the SQL session builder and unavailable-member replacement read `user_settings.new_review_ratio`. Consequently the visible choice does not currently govern the latched server queue. The server change must carry the ratio explicitly through the finite plan and idempotent start RPC, validate mixed integer values `1..5`, include it in request identity, latch it on `training_sessions`, and use the latch for replacements/resume. Keep old RPC callers compatible. Test all seven stops, scarcity, finite mid-cycle endings, preview/start parity, changed-ratio retries, preference changes after start, and replacement.

Do not ship the enabled slider independently of that server migration: a convincing but ineffective control is worse than an explicitly unavailable one.

## Follow-on server slices

1. [#409](https://github.com/vbalashi/2000nl/issues/409): model material as all accessible dictionaries, a dictionary subset, or exactly one collection; resolve access and empty sources before latching. The current selector accepts one list or defaults to NT2 2k.
2. [#408](https://github.com/vbalashi/2000nl/issues/408): carry part-of-speech and `de`/`het` choices through typed setup, plan, start, and candidate selection. OR within a choice set, AND across sets; missing metadata must not silently match a selected filter. Specify noun/article interaction and mixed stored gender values.
3. [#332](https://github.com/vbalashi/2000nl/issues/332) then [#333](https://github.com/vbalashi/2000nl/issues/333): complete idiom and sentence-translation exercise consumers as distinct single-choice families, not word filters.
4. History-filter follow-up: same-event action/result/provenance predicates and rolling windows anchored at session start. The present `daysAgo: 7` means a single study day seven days ago, not the preceding seven days.

### Conditional Dutch lexical controls

Show conditional controls inline, immediately below Part of speech, not behind an arrow inside a chip. `Noun article` appears only when Noun is explicitly selected; deselecting Noun hides it and clears its selection. With Noun + Verb selected, `de/het` narrows only the noun branch, while eligible verbs remain included. With no explicit POS choice, there is no article control and no lexical restriction. This is a deliberate change from the draft profile's earlier `empty-or-includes` presentation rule.

The Dutch profile currently defines **only** noun article as a conditional lexical filter. It does not define regular/irregular verbs or adjective classes. `word_entries.gender` supports a normalized positive `de`/`het` predicate, but also contains mixed and missing values; classify `de/het` explicitly and never equate missing metadata with the opposite article. Verb conjugation and adjective comparative/superlative forms are optional source fields. A future positive filter such as “recorded conjugation available” could be honest, but absence of a form does not prove a grammatical property. Regular/irregular, separable/reflexive/transitive, and adjective class chips need an attested typed source contract before display or candidate filtering. The source POS label itself can be inferred by ingestion, so #408 must decide whether inferred and explicit POS evidence are both eligible.

The current Pen shows Noun and Verb selected and the Noun article section in the main flow; alternate mobile node `n1ra5` shows Verb only with the Noun section removed. It does not promise a Verb subtype selector until the data contract is established. The live UI must keep lexical options disabled until #408 implements server-side filtering.

### One Training Language, common controls, and language-specific controls

The setup has one Training Language selector, presented as a compact current value with a dropdown. It is not a set of four always-visible choice buttons or a multi-select filter. Switching it re-resolves accessible dictionaries/collections, the language's Training Filter Profile, eligible exercise families, and any language-specific lexical predicates. Common controls (session size, review/new rhythm, ordinary direction and answer mode where supported) can retain their values; material and lexical selections must be restored from that language's own saved scope or reset to valid defaults. Saved presets are already namespaced by user and Training Language and must not silently cross languages.

Only `nl.v1.json` exists today. `der/die/das` for German is a useful prospective example, **not** a current product or data contract. Do not substitute Dutch `de/het` options after switching languages, and do not fabricate language profiles from interface locale. Until a selected language has an approved profile and candidate predicates, render only genuinely supported common controls and explain unavailable language-specific filters.

## Local database validation gate

The local QA database has content and some later RPCs, but no deployment ledger; health therefore reports expected `2000nl-db-155`, actual `null`. This means provenance is unverified, not that the schema is conclusively at an older migration. Do not stamp a contract marker or replay `bootstrap.sql` over this populated database. Migration 120's source-order backfill collides with occupied unique slots during replay, despite no duplicate keys currently stored. Establish migration provenance, and test any migration-120 repair on an isolated copy after deciding which source order is authoritative. Until then use disposable DB-side tests and report the local integrated smoke as unverified.
