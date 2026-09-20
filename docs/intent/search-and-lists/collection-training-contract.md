# Collections and training: reconciled contract

Date: 2026-09-20
Status: Owner-approved product decisions consolidated; empirical validation pending.

Approval history: [C1–C28](./collection-composition-decisions.md).
Execution: [agent validation plan](../../exec-plans/active/collection-training-validation.md).
This is a target contract, not a claim that the runtime already implements it.

## Objects and first-release boundary

| Object | Owns | Does not imply |
| --- | --- | --- |
| Dictionary entry | Specific meaning and content in one dictionary | Membership, recent encounter, or enrollment |
| Manual collection | Explicit unique entry references, possibly across dictionaries | Content copies or automatic membership changes |
| Rule collection | One dictionary/collection source and content-property conditions | Manual exceptions, history, time-window or learning-state filters |
| Materialization | Complete stored result of a rule evaluation | Independent rights to the referenced content |
| Training configuration/preset | Source selection and additional filters, mode, size | A saved result set or hidden collection |
| Session | Concrete exercise selection, fixed temporal conditions and action budget | Frozen FSRS state or permission to display inaccessible content |
| Action history | User, exact target, action, event time, provenance | A third content source or one global video attribute on a word |

Rule collections have one source in v1. Multiple dictionary sources are supported
for training/presets, including all accessible dictionaries or an explicit subset.
Training can also use a collection. Arbitrary unions of collections or mixed
dictionary-plus-collection source expressions are not implicitly approved.
Manual collections can hold entries from different dictionaries without a union rule.

Collection rules may use lexical properties such as part of speech and a corpus
flag. User history (including video even without a time condition), learning state,
and due dates are training-only filters. A manual collection may have any name;
naming it “Video A” does not create provenance conditions or automatic membership.

## Selection and identity

Conceptual sequence (not prescribed SQL execution order):

1. Resolve the configured dictionaries or published collection membership.
2. Enforce access; distinguish inaccessible source from accessible empty source.
3. Apply lexical and user-history conditions. Event type, time and provenance
   must match the same event of the current user.
4. Deduplicate entry IDs, not spellings. Meanings and dictionary identities stay distinct.
5. Expand into eligible exercise targets using existing mode/scheduler contracts.
6. Start a session with its accepted exercise budget and retained selection context.

History defaults to all event sources unless explicitly narrowed. Dictionary
source selection and event provenance are different controls. A mark of one meaning
does not mark other meanings, dictionaries, directions, idioms, or examples.
Several matching events admit one entry once; direct and reverse may still be
separate exercises. Entry count, eligible target count and completed exercise count
must be labeled separately. Session N counts accepted exercises under ADR 0008,
not dictionary entries or all possible targets.

Seven days means 168 elapsed hours ending at session start. Recompute previews
at new launch; retain the chosen interval on resume. A later success does not
erase an earlier forgotten event. History eligibility does not pull future-due
reviews forward. Calendar Today is outside the approved filter set.

Example: door/mouse in a shared dictionary and furniture in the user's dictionary
are explicitly marked in video A. All-accessible dictionaries plus video A admits
the three entry IDs; a single-dictionary selection intentionally narrows that pool.
Creating furniture alone, subtitle presence, or a read-only lookup is not a grade.

## Grades and provenance

The owner clarified that an external video grade is the normal card action with
video provenance. Reuse the same learning mutation on the same exercise identity,
with atomic history and semantic idempotency. A new interface must not introduce
a parallel scheduler. For ordinary cards the state key includes entry and card
type/direction; ADR 0011 defines content-bound exercise identity.

Current anchors: `packages/shared/types/platformV2.ts`,
`apps/ui/lib/platform/platformV2ActionService.ts`,
`docs/reference/platform-provenance-rpc.md`, ADR 0011 and ADR 0013.
The provenance reference also describes legacy V1 mappings: do not blindly copy
its mark-known/mark-unknown mapping into V2. V2 exposes review-card grades and
separate start-learning/mark-known/undo-known actions. Characterize real capabilities
for each card state before wiring labels. The accepted grade mapping is
Again=`fail`/1, Hard=`hard`/2, Good=`success`/3, Easy=`easy`/4. “Any answer” is a
`review-card` event with any of those four results; “forgotten” is only
`review-card`+`fail`. Mere event-row existence, lookup, reveal, `record-view`,
`start-learning` or a Known action is not a grade. “Remembered” alone is not
authority to apply Known or update all directions. Non-session Connected Client
actions must not consume an unrelated first-party session budget.

## Refresh, access and session matrix

| Condition | Browsing | New training | Existing session |
| --- | --- | --- | --- |
| First computation pending/failed | Preparing/error, never fake zero | Wait/retry | Not applicable |
| Data/membership changes; rules unchanged | Previous complete accessible result, updating indicator | Previous result allowed with notice | Keep selected context |
| Data refresh failed; rules unchanged | Previous result, failure/date/retry | Previous result allowed with notice | Keep selected context |
| Own or ancestor rule changed | Old result, explicitly stale; never label it current | Wait for matching chain revision | Keep selected context |
| Source entirely unavailable | Preserve configuration, unavailable state; no protected content | Block that source | Entries checked independently |
| Some dictionaries unavailable | Show only permitted material and notice | Available eligible subset allowed, notice required | Never display revoked entries |

Recompute parent before derivative; publish complete results atomically. Old jobs
must not overwrite newer rule results. Entry access is checked independently of
cached membership. Visible counts must describe the visible permitted result;
do not expose inaccessible private entry details in notices.

C17's single-source block and C28's multi-source reduction are complementary.
Do not silently drop a failed computation or a pending rule change as though it
were an access denial. Keep preset references intact through temporary loss.
If access is restored, refresh an affected materialized collection before reuse.

Session stability means the queue is a snapshot built at session start.
Collection/list edits, rule refreshes, and newly qualifying entries never
silently replace that active session's scope. If a latched member becomes
permanently unavailable after the plan is built, any replacement must come from
members already reserved by that session; if no such member remains, the
session ends or exhausts truthfully. It must never widen the queue by reading
new source members. Live FSRS state and access remain authoritative on resume
and action submission.

An ordinary session member does not disappear merely because its source
collection was edited: membership is latched. “Unavailable” is reserved for a
permanent, server-verifiable presentation failure after the plan was built:
dictionary access revoked, entry no longer readable (a defensive condition;
current foreign keys normally block deletion while it is latched), presentation
projection missing, invalid content model, or required direct example/reverse
definition missing.
Transient network or lookup failures remain retryable and do not retire the
member. Current migrations already implement these reasons; target rule-collection
work must preserve this distinction.

## Lifecycle

Reject direct and indirect cycles, including concurrent edits that together
would create a cycle. Block owner deletion while collections or presets depend
on a collection. Changing their sources/deleting them removes the dependency;
creating a manual copy alone does not. Completed history does not block deletion.
Deletion of a collection never means deletion of dictionary entries or progress.

Creating a manual copy freezes membership, not content. Rule filtering in Training
Setup and a saved derived collection have identical pool semantics for identical
input revisions. This equivalence is not promised between a stale materialization
and fresh live metadata; the published revision must be observable in evidence.

## Consistency audit of the interview

| Potential collision | Resolution / evidence |
| --- | --- |
| History as third source; video collections | Rejected: C24 supersedes C23. Video selection is a training predicate. |
| One source versus YouTube words across dictionaries | C19 limits rule collections; C26 permits multi-dictionary training. |
| All sources unavailable versus partial loss | C28 permits disclosed accessible subset; C17 still blocks revoked source use. |
| Materialized references treated as content copies | C1/C17: referenced content and access are read independently. |
| Grade treated as history-only | C27: ordinary FSRS mutation and event are atomic; plain lookup stays read-only. |
| One meaning interpreted as one FSRS counter | Existing entry+card-type / exercise identity retained; no direction fan-out. |
| Recent forgotten treated as currently due | C10: historical match and current scheduler eligibility are separate. |
| Session size interpreted as selected word count | ADR 0008: accepted-action budget; repetitions/directions use existing semantics. |
| Session retention interpreted as frozen access/progress | C4 retains selection, not rights, content or learning state. |
| “Automatic” interpreted as currently implemented generic refresh | Current VanDale importer refreshes memberships during import; generic engine remains target work. |
| All-accessible versus explicit dictionary selection | Preserve selector mode in preset; evaluate all-accessible at each new start; never silently widen an explicit list. |

## Engineering closure items, not new approvals

Resolve and record these in implementation evidence, without treating guesses as
accepted runtime facts. Escalate only if resolution changes visible semantics.

- Actual V2 capabilities for untracked, learning, reviewing, Known and content-bound
  cards; encounter predicates beyond the now-fixed grade mapping and treatment
  of explicit view-only interactions.
- Version retention / source fingerprinting for pool parity and unavailable-member
  replacement; how ancestor rule changes invalidate descendants immediately.
- Refresh ownership, bounded debounce, durable retries, numeric freshness targets,
  maximum supported nesting depth and batch-import behavior.
- Timestamp inclusivity. Test proposal: `start - X*24h <= event_time <= start`,
  with database-authoritative event time, excluding future/uncommitted events.
  Delayed/offline events need characterization; do not silently backdate them.
- Supported lexical filter inventory and normalization across dictionaries.
  Missing metadata must have an explicit policy, not silently mean “matches”.
- Materialization/preset exact API/schema, current-state gap inventory, and alert
  copy for unavailable sources without leaking private data.

Multi-source rule collections and calendar filters remain deferred. Core product
shaping is complete for this scope; performance feasibility and implementation
readiness require the validation report, not another round of blanket approvals.
