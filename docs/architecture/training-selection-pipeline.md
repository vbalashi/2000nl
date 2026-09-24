# Training selection pipeline

Status: architecture contract for #327, #332 and #333 (2026-09-24). This
describes the intended composition and names the current gaps; it does not
claim that the sentence UI or continuous practice is already implemented.

## One selection, several exercise families

A saved setup records **intent**, not a cached list of cards: one exercise
family, direction, material scope, lexical filters, activity filters, new vs.
review choice, size and (for mixed new/review) ratio. The server validates and
latches that setup when the learner starts a run. A changed setup is a new
run; a retry with the same request ID and equivalent selections returns the
same run. Selection arrays have set semantics, so their order and duplicates
must not change the request identity.

Selection has four stages, in this order:

1. **Entry scope:** choose the default collection, one authorized curated or
   user list, all readable dictionaries in a language, or exact selected
   readable dictionaries. Intersect with entry-level POS/article and selected
   activity. An unavailable selection produces an error or an empty set; it
   never widens to the default corpus.
2. **Family content:** ordinary meanings require a renderable definition and
   obey introduction policy. Idioms require an active `idiom` Content Node and
   exactly one usable child `idiom-explanation`; its optional examples are
   children of that same node. Sentence translation uses an active `example`
   node and its translation readiness policy. Choosing a family never changes
   a word's POS, dictionary or source membership.
3. **Exercise identity:** ordinary progress remains on the existing meaning
   and direction state. Each idiom/sentence exercise uses a target keyed by
   family, direction, entry ID and exact Content Node ID. Two idioms under one
   headword are two targets. Source revision controls visibility, not identity
   or history deletion.
4. **User queue:** intersect targets with the family's learning/Known source
   gate, hidden/frozen state and requested new/review policy; then order and
   latch session members. A grade changes the target's own FSRS state through
   the authoritative action path. Reading setup or preview never grades it.

For example, production has separate adjective entries for `vies`. The
entry for `niet vies zijn van iets` has no ordinary definition but does have
an `idiom` node, a child explanation `iets graag willen`, and a child example.
An adjective **meaning** session must not present this idiom-only entry as a
definition. An adjective **idiom** session may select the exact idiom node if
its source headword group passes the learning/Known gate. No stored
`has_idiom` flag or raw-JSON field heuristic is needed to identify the
exercise: the typed Content Node relation is the source of truth.

## Filter semantics and ownership

| Selection | Applied to | Current implementation |
| --- | --- | --- |
| Collection/dictionaries | Entry IDs, after dictionary access | Ordinary selector in migration 160; shared extra-exercise source scope in 161 |
| POS / noun article | `word_entries` attributes, normalized by one lexical predicate | `private.training_lexical_candidate_matches_v1` in both paths |
| Activity date/source | Prior **ordinary word-card action** on an entry | Ordinary selector and extra source scope use the same event tables, but separate SQL |
| Family | Typed Content Node and its parent/children | Ordinary definition policy; idiom candidate v2; sentence consumer pending |
| New/review | State of the exact exercise target | Ordinary scheduler or independent content-bound FSRS state |
| Direction | Exercise prompt/answer and progress identity | Family-specific runtime, not an entry filter |
| Session size/ratio | Run composition after eligibility | Finite sessions; continuous practice is a separate contract |

Activity filtering is presently **entry-level**. “From YouTube” means an
eligible word entry has a matching recorded word-card activity, not that the
particular idiom expression or example sentence was first discovered on
YouTube. A future content-provenance filter would need a distinct field and
source-linked Content Node data; reusing the current label for that meaning
would be misleading.

The ordinary selector still owns its combined scope/scheduling SQL. Migration
161 introduces one source-scope function for idioms and later sentences, but
does not rewrite the older ordinary scheduler in a performance-sensitive
rollout. Before enabling each family in the UI, compare the common entry
dimensions with characterization fixtures across both paths and test an
inaccessible dictionary, empty intersection and multiple meanings. Extract
the ordinary scope into the common boundary only with parity and latency
evidence, not by copying another filter branch into the family selector.

## Performance boundary

Do not invoke the headword-group eligibility function once per idiom node.
Production currently has about 18,224 entries and 2,414 active idiom nodes;
one warm call to that legacy function took about 325 ms in a read-only probe.
Migration 161 computes the learner's eligible entry/group set once and joins
it to idiom nodes. A read-only prototype of that group join across the corpus
took about 242 ms warm, but this is **not** a measured full session-start time.
Cold probes varied substantially, including one 2.5-second timeout. Keep
initial filtering off the app's first paint, benchmark the complete start
after deployment, and add a write-maintained projection only if the measured
set-based path remains too slow. Each grade should update one target and its
queue position; it must not rescan the source corpus.

The existing `all-due-today` size in ordinary Training is finite and includes
only already-due reviews. It is not the owner's newly requested continuous
practice mode, which cycles selected targets and includes future-due targets.
Do not silently reinterpret existing saved `all-due-today` presets.
