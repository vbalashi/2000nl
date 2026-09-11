# Training Exercise Model Audit — bounded evidence

Date: 2026-09-11  
Repository: `2000nl`  
Commit: `eb7a9a3c73ffdd292d7130735c85c81a0bbfbc2b`  
Scope: read-only application/content/data audit; only this evidence document and
planning records are written. No production access or database mutations.

## Database inspection boundary

The live database inspected was the local Docker Supabase database at
`127.0.0.1:54322`, using the documented read-only path:

```sh
scripts/db-local-supabase.sh check
```

The wrapper validated the local target and ran its SQL with
`default_transaction_read_only=on`. It reported 18,163 dictionary entries and
18,163 search documents. Production was not queried, and no production census
is claimed here.

## Corpus provenance and counts

Primary corpus paths:

- Raw scrape: `packages/ingestion/nl/vandale-nt2/data/word_list.json`
- Current committed v2 artifacts: `db/data/words_content/*.json`
- Current artifact manifest: `db/data/words_content/_manifest.summary.json`
- Older/generated ingestion artifacts: `packages/ingestion/nl/vandale-nt2/data/words_content/*.json`

The two raw scrape copies are byte-identical: 33,449,101 bytes, SHA-256
`1d9236554fd35f49ca9fa274045d84a5ee3ea04035a85f89a21391878b685173`, and contain
14,449 source records (`jq 'length' word_list.json`).

`db/data/words_content/_manifest.summary.json` declares:

```json
{
  "artifact_count": 18163,
  "artifact_format_version": "vandale-structured-v2",
  "identity_scheme_version": "vandale-provider-article-v1",
  "source_record_count": 14449
}
```

### Count method

The artifact counts and cardinalities below were computed from JSON files, not
SQL. The local database counts were independently checked with SQL.

JSON artifact scan:

```sh
python3 - <<'PY'
import json, pathlib
root = pathlib.Path("db/data/words_content")
files = sorted(root.glob("*.json"))
docs = []
for path in files:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        continue
    if isinstance(value, list) and value and isinstance(value[0], dict):
        docs.append((path, value[0]))
print("artifacts", len(docs))
print("headwords", len({doc.get("headword") for _, doc in docs}))
print("entries_with_definition", sum(any(
    isinstance(m, dict) and isinstance(m.get("definition"), str)
    and m["definition"].strip() for m in doc.get("meanings", []) or [])
    for _, doc in docs))
print("entries_with_idiom", sum(any(
    isinstance(m, dict) and (m.get("idioms") or [])
    for m in doc.get("meanings", []) or []) for _, doc in docs))
print("idiom_expressions", sum(len(m.get("idioms", []) or [])
    for _, doc in docs for m in doc.get("meanings", []) or []
    if isinstance(m, dict)))
print("idiom_explanations", sum(1
    for _, doc in docs for m in doc.get("meanings", []) or []
    if isinstance(m, dict) for idiom in m.get("idioms", []) or []
    if isinstance(idiom, dict) and isinstance(idiom.get("explanation"), str)
    and idiom["explanation"].strip()))
print("idiom_examples", sum(len(idiom.get("examples", []) or [])
    for _, doc in docs for m in doc.get("meanings", []) or []
    if isinstance(m, dict) for idiom in m.get("idioms", []) or []
    if isinstance(idiom, dict)))
PY
```

| Measure | Count | Method |
|---|---:|---|
| Structured artifacts | 18,163 | JSON |
| Distinct headwords | 13,775 | JSON |
| Entries with a definition | 16,924 | JSON |
| Entries containing idioms | 1,958 | JSON |
| Entries without definition but with idioms | 1,089 | JSON, independently recounted |
| Idiom expressions | 2,376 | JSON / local DB |
| Idiom explanations | 2,374 | JSON / local DB |
| Idiom-specific examples | 1,347 | JSON / local DB |

The older ingestion artifact directory contains 17,959 artifacts and should
not be mixed with the current `db/data` census.

Local SQL cross-check used the same JSONB predicates against
`public.word_entries`; it returned 18,163 entries, 13,775 headwords, 16,924
entries with definitions, 1,958 entries with idioms, 2,376 idioms, 2,374
explanations, and 1,347 idiom examples.

## Two idioms missing explanations

Both occur in:

`db/data/words_content/003081_a3045_drop_zn_1.json`

| Headword | Entry ID | Expression | Content-node ID | Diagnostic locator |
|---|---|---|---|---|
| `drop` | `3d62c5f5-381f-4019-bdaf-3158c1803182` | `zoete en zoute drop` | `2f7f0a68-0bc6-4af9-b2a8-2fbadfd9b95d` | `raw.meanings[0].idioms[0]` |
| `drop` | `3d62c5f5-381f-4019-bdaf-3158c1803182` | `een dropje nemen` | `dfe7447e-5ff2-4750-9926-e1372ac9fabc` | `raw.meanings[0].idioms[1]` |

The artifact contains both expressions without an `explanation` property. The
embedded source HTML labels these as `voorbeelden` (examples), so the coordinator
flags a likely ingestion classification issue, not proof that real semantic idioms
necessarily lack definitions. This needs source/parser verification under #195;
do not invent explanations or silently relabel production nodes in this audit.
The
node IDs were obtained from the local DB with:

```sql
SELECT id, entry_id, diagnostic_locator, source_text_fingerprint
FROM private.platform_v2_content_nodes
WHERE entry_id = '3d62c5f5-381f-4019-bdaf-3158c1803182'
  AND kind = 'idiom'
  AND binding_state = 'active'
ORDER BY diagnostic_locator;
```

## Exercise-model findings

- Regular-sense exercises need an explicit idiom-only exclusion. Current
  scheduler exclusion handles pointer-only cross-references, not idiom-only
  meanings.
- Idiom expression, explanation, and optional nested examples already have
  separate Platform V2 content-node kinds and parent identity.
- Current FSRS state is keyed by `(user_id, entry_id, card_type_id)`; no
  sentence-specific or idiom-specific card type/state exists locally.
- Sentence translation can use Dutch as source and the UI translation language
  as target without making translation language part of progress identity.
- Multiple idioms under one entry require durable content-node/card identity;
  `entry_id + card_type_id` alone would collide.
- “Any learning/Known sense makes the headword eligible; include all senses” is
  not currently implemented. The local DB has only 9 learner card-state rows
  and 0 active Known marks, so no meaningful eligibility census is claimed.

## Translation contract evidence

Primary implementation:

`apps/ui/lib/translation/dictionaryMeaningTranslationContract.ts`

- Contract version: lines 5–6.
- Request identity and source/target languages: lines 36–53.
- Semantic roles, including idiom and idiom explanation: lines 28–34.
- Idiom/explanation/example field IDs: lines 173–187.
- Idiom-only handling: lines 128–133 and 190–205.

Platform V2 contract:

`docs/architecture/sense-card-platform-v2-contract-plan.md`

- Content-node kinds and parent identity: lines 267–305.
- Translation target, source fingerprint, and freshness identity: lines 307–344.
- Explicit translation request shape: lines 334–339.

Translations bind to the exact content node and source fingerprint; array order
is not durable identity.

## Coordinator: learning state, selection and session contract

Code baseline: `eb7a9a3c73ffdd292d7130735c85c81a0bbfbc2b`.
This is read-only source inspection, not execution of migration/preservation tests.

### Confirmed current behavior

- State and Known are keyed by user + sense entry + direction, not a shared
  meaning-level enrollment: [status schema](../../db/migrations/042_physical_user_card_status.sql#L22),
  [Known schema](../../db/migrations/113_platform_v2_known_marks.sql#L28),
  [action handler](../../db/migrations/113_platform_v2_known_marks.sql#L1197).
  The Known contract deliberately preserves FSRS fields.
- Learn sets in-learning without synthesizing a recall grade:
  [start-learning](../../db/migrations/076_start_learning_sets_in_learning.sql#L27).
  Meaning-wide Learn/Known must preserve distinct directional memory and undo/history.
- New candidates cross-join modes and use cohort/hash ordering, not ordinary-sense
  sequence: [selector](../../db/migrations/128_bound_authoritative_next_card_selector.sql#L156).
  Next-calendar-day offering needs an explicit date/timezone contract; current daily
  accounting uses database current_date/reviewed_at::date, not proof of user-local day.
- The unfiltered selector actively gates new and review candidates with remaining
  daily quotas: [limits](../../db/migrations/128_bound_authoritative_next_card_selector.sql#L83),
  [classification](../../db/migrations/128_bound_authoritative_next_card_selector.sql#L230).
  Filtered selection bypasses the gate. Finite session start latches from that same
  selector: [session start](../../db/migrations/133_latched_training_session_membership.sql#L139).
  Removing a UI label cannot remove this gate.
- Accepted Learn/Known/review actions atomically consume session membership;
  transport duplicates bind to the same event:
  [action binding](../../db/migrations/134_session_scoped_card_selection.sql#L281).
  Keep that boundary. Distinct target membership is not a general count of arbitrary
  later intentional attempts at the same target; characterize before changing it.
- Displayed ordinal currently initializes to consumed+1 and increments on changed
  presented-card key: [presentation](../../apps/ui/components/training/v2/useTrainingSessionPresentation.ts#L95).
  It is not the agreed completed-action count; this explains why replacement can
  inflate presentation progress without a new history action.
- Existing new/review switching is reusable:
  [queue ratio](../../apps/ui/lib/training/trainingQueue.ts#L22).
  Observability already distinguishes newWordsToday (distinct entries) from
  newCardsToday (entry/direction):
  [statistics](../../db/migrations/130_learning_observability.sql#L51).

### Accepted target and complexity assessment

The session budget is **completed accepted actions**, NOT unique meanings:
Learn, Known and each grade count once; another direction is another exercise.
New-enrollment statistics count unique meanings; there is no daily blocking cap.
Hints, reveal, load failures, retries and replacement count zero.

Overall change is medium-to-high complexity, concentrated in identity/selection
and migration, not FSRS arithmetic. Sequential next-day offering alone is a bounded
scheduler change if based on authoritative sense ordering and an indexed eligibility
timestamp/projection; implementation cost and query plans have not been measured.
Do not add per-candidate unbounded scans of immutable history.

Preservation gates:
1. Keep existing directional FSRS/due/history, including later enrolled meanings.
2. Define precedence for legacy asymmetric Known vs learning and preserve undo.
3. Do not copy one old idiom-only sense state into multiple idiom exercises.
4. Gate removal of old idiom presentation on a usable alternative and approved mapping.
5. Keep new-introduction rules separate from existing review eligibility.
6. Verify before/after identity counts and state snapshots in a disposable fixture,
   then bounded read-only production inventory before migration. The local learner
   population is not evidence of the real user's asymmetric/idiom state.

## Delivery and approval boundaries

The authoritative accepted specification and live status are
[#327](https://github.com/vbalashi/2000nl/issues/327); this report is evidence,
not a second backlog.

- [#328](https://github.com/vbalashi/2000nl/issues/328): shared meaning Learn/Known.
- [#329](https://github.com/vbalashi/2000nl/issues/329): sequential new introductions.
- [#330](https://github.com/vbalashi/2000nl/issues/330): content/mode eligibility.
- [#331](https://github.com/vbalashi/2000nl/issues/331): deferred visual approval.
- [#332](https://github.com/vbalashi/2000nl/issues/332): idiom exercises/preservation.
- [#333](https://github.com/vbalashi/2000nl/issues/333): sentence translation.
- [#334](https://github.com/vbalashi/2000nl/issues/334): action sessions without daily caps.

Reuse [#195](https://github.com/vbalashi/2000nl/issues/195) for corpus/prompt audit,
[#298](https://github.com/vbalashi/2000nl/issues/298) for naming/units,
[#290](https://github.com/vbalashi/2000nl/issues/290) for temporal contract tests,
and [#325](https://github.com/vbalashi/2000nl/issues/325) for observed recovery.
[#326](https://github.com/vbalashi/2000nl/pull/326) is the separate narrow reverse
compatibility fix, not implementation of this model.

No app code, migration, FSRS state, production data, or visual design changed in
this audit. No migration-preservation or browser tests are claimed for the proposed
model. Visual work requires owner-approved Pen review before implementation.
