# SenseCard Real-Data Contract Audit

Date: 2026-07-29
Status: proposed contract; repository evidence audit for issue #71

## Outcome

The current durable learning model is meaning-level:

```text
Dictionary
└── Headword Group (presentation/search only)
    ├── Dictionary Entry (one meaning)
    │   └── SenseCard = entry ID + card type + user state
    └── Dictionary Entry (another meaning)
        └── SenseCard = entry ID + card type + user state
```

A multi-meaning UI may group several SenseCards under one headword, but review,
learn, known, translation, and meaning-specific feedback actions must retain
the target entry ID. The grouped headword is not a substitute identity.

The existing singular `meaningId` and plural `content.meanings` are therefore
not two competing domain models:

- `meaningId` is the source/order metadata of the meaning-level entry;
- `content.meanings` is a normalized envelope inherited from raw dictionary
  schemas that can technically carry an array;
- in the audited Van Dale NT2 corpus, 17,819 artifacts carry one raw meaning,
  140 carry none, and none carries more than one.

The plural field should not be used by clients to infer that one returned entry
owns the other meanings of the headword.

## Evidence Base

This is a static repository and source-corpus audit, not a production-data
audit. Evidence was read from:

- `packages/ingestion/nl/vandale-nt2/data/words_content/`;
- `packages/docs/data-model.md`;
- `db/migrations/001_core_schema.sql`;
- `db/migrations/004_user_features.sql`;
- `db/migrations/042_physical_user_card_status.sql`;
- `db/migrations/059_security_harden_user_scoped_rpcs.sql`;
- `apps/ui/lib/platform/projections/dictionaryContent.ts`;
- `apps/ui/lib/platform/translationService.ts`;
- `apps/ui/lib/platform/generatedEntryDraftService.ts`;
- `apps/ui/lib/platform/userDictionaryService.ts`;
- AudioFilms `app/src/lib/dictionary/overlayProjection.ts`;
- AudioFilms extension dictionary presentation and generated-entry modules.

The corpus-wide collision scan was reproduced from the checked-in source
snapshot for this audit. A separate production binding audit is still required
before changing source identity or re-import behavior.

### Related work

This audit narrows the semantic contract and links to, rather than duplicates:

- [2000NL #50](https://github.com/vbalashi/2000nl/issues/50) for generated and
  phrase-card lifecycle;
- [2000NL #51](https://github.com/vbalashi/2000nl/issues/51) for structured
  feedback storage and review;
- [2000NL #52](https://github.com/vbalashi/2000nl/issues/52) for client-visible
  preferences and capabilities;
- [2000NL #53](https://github.com/vbalashi/2000nl/issues/53) for observed source
  labels;
- [AudioFilms #19](https://github.com/vbalashi/audiofilms/issues/19) for strict
  lookup compatibility;
- [AudioFilms #24](https://github.com/vbalashi/audiofilms/issues/24) for
  card-level feedback UI;
- [2000NL #64](https://github.com/vbalashi/2000nl/issues/64) for the approved
  translation off/on visual matrix.
- [2000NL #70](https://github.com/vbalashi/2000nl/issues/70) for publishing and
  compatibility-testing the resulting presentation DTO.

The parent workstream is
[2000NL #57](https://github.com/vbalashi/2000nl/issues/57).

## Representative Real Scenarios

### One headword, one meaning-level entry

`huis_zn_1.json` contains `meaning_id: 1` and one raw meaning with:

- definition: `een gebouw om in te wonen = de woning`;
- three examples;
- idiom `van huis uit …` with an explanation.

The definition, examples, and idiom are sections of one Dictionary Entry and
therefore one SenseCard for a selected card type.

### One headword, multiple meaning-level entries

`bank_zn_1.json` and `bank_zn_2.json` are separate artifacts:

| Entry | Meaning ID | Definition | Examples |
| --- | ---: | --- | ---: |
| `bank_zn_1` | 1 | furniture for several people to sit on | 2 |
| `bank_zn_2` | 2 | a company that keeps or lends money | 1 |

The UI may render both below the headword `bank`, but each row/block is a
separate SenseCard with its own entry ID and user actions.

The normalized Platform shapes are correspondingly separate:

| Lookup item | `meaningId` | `content.meanings` | `content.sections` |
| --- | ---: | --- | --- |
| bank/furniture entry | 1 | one object containing its definition and two examples | one `meaning`, two `example` sections |
| bank/finance entry | 2 | one object containing its definition and one example | one `meaning`, one `example` section |

The headword-level UI count `2 betekenissen` is computed from the returned
group; it is not the length of either entry's `content.meanings`.

### Usage pattern is not an example

`liggen_ww_2.json` contains:

- definition: `passen bij`;
- context: `iemand of iets ligt iemand`;
- example: `dat werk ligt haar wel`.

The source field named `context` is a schematic Usage Pattern in this corpus.
The Platform should project it as a distinct semantic section. The client
should label it with a localized UI message and must not merge it into the
examples list.

For this entry the normalized `content.meanings` still has one object, while
`content.sections` contains `meaning`, `context`, and `example` sections with
their own source paths.

The corpus contains 3,867 non-empty `context` values among 17,959 audited
artifacts and no top-level `notes`, so the two concepts must not be conflated.

### A meaning can lack a definition

`liggen_ww_3.json` has an empty definition and examples but contains the idiom
`de wind gaat liggen` with its explanation. A Dictionary Meaning therefore
requires meaningful content, not specifically a definition string. Summary and
collapsed-card behavior must choose the first suitable semantic section rather
than inventing a definition.

### Rich meaning content remains inside one entry

`dromen_ww_1.json` contains one meaning with a Usage Pattern, two examples, and
an idiom. These elements enrich one learnable meaning; they do not become
independent review targets unless a future product decision explicitly creates
new entries/card types for them.

## Field and Ownership Map

| Concern | Durable owner | Platform projection | Client rule |
| --- | --- | --- | --- |
| Headword grouping | dictionary + language + normalized headword, with source/POS grouping still under identity remediation | multiple lookup items | group for display only |
| Learnable meaning | `word_entries.id` | one lookup item / entry envelope | one SenseCard |
| Source ordinal | `word_entries.meaning_id` | `entry.meaningId` and `content.meaningId` | display/order hint, not standalone identity |
| Card variant | `card_type_id` | capability/state map by card type | combine with entry ID |
| User learning state | `(user_id, entry_id, card_type_id)` | per-card capabilities and state | mutate the exact SenseCard |
| Definition/pattern/example/idiom | entry raw content | typed `content.sections[]` | render the supplied kind |
| Translation | entry translation artifact and target language | direct translation on the matching section | do not re-join by array order |
| Meaning feedback | entry ID, optionally a section anchor | explicit action payload | never guess from headword |
| Headword-wide feedback/action | explicit headword-group identity | separate group action | do not send as a meaning action |

## Identity Limits

The database currently enforces uniqueness on
`(dictionary_id, language_code, headword, meaning_id)`. This proves that an
entry is meaning-level, but it does not prove that `meaning_id` is a stable
semantic identifier across source revisions.

The reproduced source scan found 539 current-key collision groups spanning
multiple payload parts of speech and at least 570 variants that cannot coexist
under the current key. Consequently:

- `entry.id` is the current durable runtime identity;
- `meaningId` is a source ordinal/display hint;
- clients must not synthesize entry identity from headword + meaning ID;
- source re-import and binding work must resolve POS/homograph collisions before
  claiming cross-revision semantic stability.

## Section Semantics and Localization

The Platform currently projects raw content into typed sections:

| Raw field | Section kind | Product meaning |
| --- | --- | --- |
| `definition` | `meaning` | definition or same-language explanation |
| `context` | `context` | Usage Pattern for the audited Van Dale source |
| `examples[]` | `example` | natural-language usage example |
| `idioms[]` | `idiom` | idiomatic expression, with explanation in `label` |
| legacy `notes` | `note` | editorial/user note only |

Empty strings should not produce visible sections. The current Platform
projection admits an empty `context` section because it checks the value's type
rather than non-empty content; AudioFilms later drops it. The Platform should
eventually normalize this consistently at the source boundary.

Labels such as `Betekenissen`, `Voorbeelden`, `Gebruikspatroon`, `Report`, and
review-result copy are interface messages, not dictionary data. Contracts
should expose semantic kinds/action IDs; each client resolves message keys
through the selected interface locale. They must not be hardcoded from the
dictionary language.

## Translation Binding

### Current behavior

Translations are cached per entry, target language, and provider. The cached
overlay mirrors `meanings[]`, `examples[]`, and `idioms[]` by position.
`dictionaryContent.ts` then joins translated text back to a section using an
index-bearing `sourcePath` and returns the translation directly on that
section.

The Platform currently exposes the cache row's `source_fingerprint` through a
field named `translationPolicyVersion`. Source revision/fingerprint and
translation-policy version are different concepts and should become separate
contract fields.

AudioFilms correctly prefers `section.translation`. Its legacy fallback can
still infer translations by the ordinal of same-kind sections and maps
`context` to a generic note/context slot. That fallback is fragile and should
be removed after the direct-section contract is mandatory.

### Required safe contract

For the current schema, a translated section must be revision-scoped by:

```text
entryId + contentFingerprint + sectionId/sourcePath
```

If the content fingerprint differs, the translation must be treated as stale
or unavailable; the system must not attach it to the section now occupying the
same array index.

The next translation artifact shape should carry explicit section bindings,
for example:

```json
{
  "sourceFingerprint": "…",
  "sections": [
    {
      "sectionId": "example-1-1",
      "sourcePath": "raw.meanings[0].examples[0]",
      "sourceTextFingerprint": "…",
      "translatedText": "…"
    }
  ]
}
```

This is safe across a fixed content revision. A later source-binding phase may
add provider-defined section keys that survive reordering; array paths alone
cannot provide that guarantee.

## Missing Dictionary Words

A lookup miss must not create a new canonical meaning in a curated dictionary.
The current generated-entry flow has the right lifecycle boundary:

1. create a private candidate with `draftSetId`, `candidateId`, and `revision`;
2. render it through a lookup-like card with `meaningId: null`;
3. persist only after an explicit save;
4. create a private user-owned Dictionary Entry;
5. start learning only through a separate explicit action.

The persisted user entry currently receives `meaning_id = 1`; the writer
rejects another entry with the same user dictionary, language, and headword
instead of allocating a second ordinal. That value is local persistence
metadata, not evidence that the generated content became Van Dale meaning 1.
Supporting multiple user-authored meanings under one headword therefore needs
an explicit identity/writer change.

## User Override Gap

The current model supports:

- shared/provider translation cache in `word_entry_translations`;
- per-user notes in `user_word_notes`;
- editable private user Dictionary Entries, including copies.

It does not expose a first-class per-user definition or translation override
that:

- remains linked to the original curated entry;
- takes precedence for that user;
- preserves the original source content;
- has explicit provenance and undo semantics.

This is a separate product/data-model gap. It should not be approximated by
mutating shared translations or silently replacing curated entry content.

## Action Target Rules

- Learn, review result, mark known, undo known, and card progress target
  `(entryId, cardTypeId)`.
- Meaning-level report actions target `entryId`; section-specific reports add
  the revision-scoped section anchor.
- A headword menu may contain only genuinely group-wide actions and must carry
  an explicit group identity.
- A collapsed multi-meaning block still represents a known entry ID even when
  most content is hidden.
- A grouped operation may fan out to several explicit entry IDs, but the client
  must send that set; the backend must not rediscover targets from display
  order.

## Decisions and Follow-up Boundaries

Accepted by this audit:

1. Dictionary Entry and SenseCard are meaning-level.
2. Headword grouping is presentational and searchable, not a learning identity.
3. Usage Pattern is a distinct section kind.
4. Clients render Platform semantic sections and direct section translations.
5. Missing-word drafts remain private candidates until explicit persistence.

Not solved here:

- corpus/source identity collisions and stable cross-revision binding;
- migration from positional translation overlays;
- personal definition/translation overrides;
- final headword-group identity and complete lookup pagination;
- UI implementation of the approved Pencil states.

These require separately owned implementation issues; this audit does not
authorize schema or runtime changes.
