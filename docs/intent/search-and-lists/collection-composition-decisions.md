# Collection composition decisions

Date: 2026-09-20
Status: Accepted product baseline, reconciled 2026-09-20; runtime and performance validation pending.

This document records owner decisions from the collection/training discussion.
It describes target product behavior, not a claim of implemented runtime support.
The existing [source-of-truth decision](./source-of-truth-decision.md) remains
the baseline for dictionary content, membership, and independent learning state.

## Reading order and authority

Use the [reconciled contract and audit](./collection-training-contract.md) for
the current unambiguous reading, and the
[agent validation plan](../../exec-plans/active/collection-training-validation.md)
for executable acceptance scenarios and measurement requirements. This file
preserves decision IDs and approval provenance. C23 is superseded, not active.
Engineering proposals and unresolved details in the companion files must not be
reported as owner-approved product requirements or verified implementation.

## C1 — Two collection types (accepted)

Owner confirmation: “принимаем” to the proposed two-type model on 2026-09-20.

- A manual collection stores an explicitly selected set of references to
  dictionary entries. Users add or remove membership.
- A rule-based collection defines membership through a source and filters.
  Users edit the source and rule; they cannot manually add members or exclude
  individual entries alongside that rule in this model.
- A collection may serve as the source of a rule-based collection, including
  a manual collection. C2–C6 and C11–C13 govern dependencies and refresh.
- “Create a manual copy of the current result” creates a separate manual
  collection containing the currently selected entry references. Subsequent
  source membership changes do not change that copy. Dictionary content is
  still referenced, not duplicated or frozen.
- Materialization is a storage/evaluation choice, not a third product type.

Examples: “Words from my lesson” is manual; “Verbs from my lesson” is
rule-based. A manual copy of the latter can be edited independently.

## C2 — Automatic membership refresh (accepted)

Owner confirmation: “согласен” on 2026-09-20.

Rule-based collections automatically follow changes to their source membership
and to entry data relevant to their filters. Users do not have to press Refresh.
A manual refresh may accelerate recomputation or retry a failure, but is not
required for normal updates. This does not require instantaneous recomputation;
behavior while rebuilding is governed by C3/C5/C12/C13; numeric freshness
targets remain subject to measurement.

Example: adding a verb to the manual “Lesson” collection adds it to the derived
“Lesson verbs”; removing it removes the derived membership. Changing an entry's
part of speech reevaluates its eligibility. A manual copy remains independent
of subsequent source membership changes under C1.

## C3 — Complete results during refresh and failure (accepted)

Owner confirmation: “принимаем” on 2026-09-20.

During recomputation, show the previous complete membership with an “Updating”
indicator, then atomically replace it with the new complete result. Counts and
displayed membership must represent the same published result.

If recomputation fails, retain the previous complete result, show an update
failure, and offer retry. On initial creation, show a preparing state until
the first result is ready; do not represent an uncomputed collection as empty.

Access checks remain independent of materialized membership: retaining an old
result never authorizes displaying entries that are no longer accessible.
C4 governs collection changes during an existing session; C5 governs starting
training during refresh.

## C4 — Active training keeps its selected membership (accepted)

Owner confirmation: “принимаем” on 2026-09-20.

Changes to collection membership affect subsequent training sessions. An already
started session retains its selected set: newly added entries do not enter it,
and entries removed only from the collection remain in that session.

This preserves membership, not copies of dictionary content or frozen learning
state. A deleted or access-revoked dictionary entry must not be displayed;
handling an unavailable exercise follows the separate training contract.

Example: five verbs added and two removed from “Lesson verbs” after session
start change the source for subsequent sessions, not the current selected set.

## C5 — Starting training during refresh (accepted)

Owner confirmation: “принимаем” on 2026-09-20.

- When source data or membership changes while the collection rule remains
  unchanged, a new session may start from the last complete published result.
  Clearly tell the learner that the collection is updating and the session
  will use the previous membership.
- After the user changes the collection rule, including its source or filters,
  starting a new session must wait for a complete result matching that rule.
  Do not start a noun session using the previous verb result. If recomputation
  fails, show the failure and offer retry.
- Initial creation likewise requires the first complete result before training
  can start. Already started sessions continue under C4.

C13 governs starting from an old result after a source-only refresh failure.
C12 governs changes to rules of upstream collections.

## C6 — Reject dependency cycles (accepted)

Owner confirmation: “принимаем” on 2026-09-20.

Collection creation and source changes must reject both direct self-dependencies
and indirect dependency cycles. Explain that the proposed source already depends
on the current collection; preserve the existing rule when rejecting a change.

Example: “VanDale 2k → Verbs → Irregular verbs” is permitted. Making “Irregular
verbs” the source of “Verbs” is rejected. Recompute dependencies before their
derived collections. Nesting depth limits remain a separate open decision.

## C7 — Rolling time windows belong to training (accepted)

Owner confirmation: “принимаем” on 2026-09-20.

Rolling time filters such as “in the last X days” are available in Training
Setup and saved training presets, not in collection rules. Collections therefore
do not require membership refresh solely because such a time window advances.
This supersedes the earlier interview example of a collection of words from
the last seven days; that example is not an approved collection capability.

Training can combine a collection with a recent-event condition. For example,
an entry saved two months ago can qualify through a forgotten-word event
yesterday; its original addition date must not substitute for that event date.
Exact event types remain open; C8 and C9 settle event-source scope and rolling
window duration/anchoring respectively.

The upstream rule-change proposal was deferred during the time-filter discussion
and subsequently accepted in C12.

## C8 — Recent activity spans sources unless explicitly scoped (accepted)

Owner confirmation: “принимаем” on 2026-09-20.

A training collection defines the eligible entry pool. Recent activity filters
look for matching events across all sources by default; the collection's name
or provenance does not implicitly constrain the event source.

An explicit event-source filter may narrow this history. When event type, time,
and source are specified together, the same event must satisfy all conditions;
do not combine the date of one event with the source or type of another.

Example: bread belongs to a manually curated “Lesson” collection and was marked
forgotten yesterday in Video B. Training “Lesson” with “marked forgotten in the last seven days”
includes bread by default. Adding an event-source restriction to Video A
requires a matching forgotten event in Video A within that period.

## C9 — Rolling windows are fixed-duration and anchored at session start (accepted)

Owner confirmation: “принимаем” on 2026-09-20.

“Last X days” means a rolling duration of X times 24 hours, measured backwards
from training session start. Seven days means 168 hours, not seven calendar
dates. Setup counts are previews; evaluate the interval again when starting
the session and retain that interval for the session, including later resume.
The next session evaluates its own interval. This follows C4's stable selected
membership policy.

Example: a Sunday 15:00 start selects a seven-day window beginning 168 hours
earlier. Local clock labels may differ across daylight-saving transitions;
elapsed duration remains authoritative.

The separately suggested calendar “Today” filter and its boundary are not
approved by this decision. Exact timestamp endpoint inclusion remains open.

## C10 — Later success does not erase recent forgotten-event eligibility (accepted)

Owner confirmation: “принимаем” on 2026-09-20.

An entry with a matching forgotten event in the selected period continues to
match that historical filter even if the learner later answers successfully.
The filter asks whether the event occurred, not whether the latest learning
state is unsuccessful.

Matching the filter only admits the entry into the candidate pool. Training
mode and scheduling independently determine whether an exercise can be shown
now. The recent-forgotten filter alone must not pull future-due reviews forward.

Example: bread was marked forgotten yesterday and successfully reviewed today.
It still matches “marked forgotten in the last seven days”, but that does not
make its next scheduled review immediately due.

## C11 — Block deletion while dependent collections exist (accepted)

Owner confirmation: “принимаем” on 2026-09-20.

Prevent deletion of a collection while other collections depend on it and show
the dependent collections. Do not cascade-delete them or leave broken rules.
Users may change their sources, preserve desired results in separate manual
collections and delete the derived collections, or delete unwanted dependents
before deleting the source. Creating a manual copy alone does not remove the
original dependency.

Deleting a collection does not itself delete dictionary entries or learning
progress. Example: “Lesson” cannot be deleted until the dependency from
“Lesson verbs” is removed.

## C12 — Upstream rule changes gate new derived training (accepted)

Owner confirmation: “принимаем” on 2026-09-20.

Changing a collection's rule, including its source or filters, prevents starting
new training sessions from its affected derived collections until their results
have been recomputed through the dependency chain to match the changed rule.
Dependencies are recomputed before their derivatives; a stale derived result
must not be presented as ready under the new upstream rule.

This extends C5's rule-change behavior to upstream dependencies. Ordinary data
or membership refreshes still permit starting from the previous complete result
with notice under C5. Already started sessions continue under C4.

Example: changing the source of “Verbs” from VanDale 2k to the full VanDale
dictionary requires recomputing both “Verbs” and its derivative “Irregular
verbs” before a new session can start from that derivative.

## C13 — Source-data refresh failure does not block usable prior results (accepted)

Owner confirmation: “принимаем” on 2026-09-20.

If a data or membership refresh fails while the collection's rule and its
upstream rules remain unchanged, allow starting training from the previous
complete published result. Clearly show the update failure, the date/time of
the retained result, and a retry action.

This permission requires a prior complete result computed under the applicable
rules. A failure after a local or upstream rule change continues to block new
training under C5/C12. Access checks apply independently in all cases.

Example: a failed post-import refresh of “VanDale 2k verbs” permits training
from the previous complete membership, with notice, provided its definition
has not changed.

## C14 — Filter directly in Training Setup (accepted)

Owner confirmation: “принимаем” on 2026-09-20.

Training Setup may select a collection and apply additional filters without
requiring creation of a derived collection. Filters supported in both collection
rules and Training Setup must have the same selection semantics. Given the same
source data version and conditions, they produce the same entry pool.

Example: selecting VanDale 2k plus “verbs” in Training Setup yields the same
pool as the derived “VanDale 2k verbs” collection computed from that version.
Training mode, scheduling, and session size subsequently determine exercises
from that pool; pool equivalence does not promise identical session queues.

A saved collection can be browsed and used as another collection's source.
Training filters belong to the training configuration and may be saved in a
training preset. Rolling time windows remain training-only under C7.

## C15 — Training presets store a recipe, not session membership (accepted)

Owner confirmation: “принимаем” on 2026-09-20.

A training preset stores the training configuration and a reference to its
source collection (or dictionary under C18): selection filters, event/time conditions, mode, session size,
and other applicable training settings. It does not save the concrete session
membership as the reusable recipe.

Each new launch evaluates that configuration against the source membership
available under C5/C12/C13, current history, and scheduling. Time windows are
anchored at that launch under C9. The same preset can yield different eligible
entries and exercises on different launches.

Resuming an interrupted session is a separate action and retains the existing
session's fixed conditions under C4/C9.

Example: “Recently forgotten verbs” saves VanDale 2k, the verb filter, forgotten
events in the last seven days, review mode, and ten exercises; it does not save
today's selected entries as the preset's permanent membership.

## C16 — Preset references also prevent collection deletion (accepted)

Owner confirmation: “принимаем” on 2026-09-20.

Prevent deleting a collection while saved training presets reference it. Show
the affected presets so the user can select another source for them or delete
unneeded presets before deleting the collection. Do not silently substitute a
different collection or cascade-delete presets.

This extends C11's deletion protection to saved training recipes. Completed
training history alone does not block collection deletion: it records past
activity rather than configuring future launches.

Example: “Review lesson verbs” must be repointed or deleted before its source
collection “Lesson verbs” can be deleted.

## C17 — Preserve configuration when source access is lost (accepted)

Owner confirmation on 2026-09-20: “считаем, что доступ к исходной коллекции,
если пропадает, то мы помечаем источник недоступен. Да, всё верно.” The owner
also identified subscription expiry and dictionary withdrawal as examples.

When access to a required source collection or dictionary is lost, preserve
the user's derived collection definitions and training presets, mark the source
unavailable, and block new training through that unavailable source. C28 permits
continuing with the accessible subset of a multi-dictionary training scope. Stored
membership is not an independent grant of access. Users can select another
available source; restored access requires refreshing the derived collection
before enabling its use again.

For already started sessions, distinguish loss of collection access from loss
of entry-content access: C4 retains selected membership, but inaccessible
dictionary entries must not be displayed. Subscription expiry or withdrawal
that revokes entry access cannot be bypassed through an old materialization
or session. This decision does not define grace periods or lifetime grants.

### Preset evaluation clarification (C15)

A preset stores configuration, not a materialized collection. When its source
is a materialized collection, each new launch uses the published membership
permitted by C5/C12/C13 and applies the preset's filters, history, access, and
scheduling checks to form a new session. Launching a preset does not itself
require rebuilding that source collection. Direct dictionary sources, accepted
in C18, need their own selection evaluation; a preset does not implicitly
create a saved collection. Performance strategy remains an implementation question.

## C18 — Dictionaries may directly source training and presets (accepted)

Owner confirmation: “принимаем” on 2026-09-20.

Training Setup and saved training presets may reference a dictionary directly,
as well as a collection. Users do not have to create a collection first.
Apply training filters and eligibility checks to the dictionary-backed pool
when forming the new session, with access checked at launch and during use.
No saved collection is implicitly created by this operation.

Example: “VanDale dictionary → verbs → ten exercises” is a valid training
configuration and can be saved as a preset. C17 governs loss of source access.

## C19 — One source first; multi-source union deferred (accepted)

Owner confirmation: “Фиксируем.” on 2026-09-20.

On 2026-09-20 the owner supported the flexibility of multiple sources but raised
scope/complexity concerns and requested an implementation assessment before
deciding whether to include it in the first release.

First deliver one dictionary or collection source per rule-based collection;
retain multi-source union as a separate later stage. This restriction
does not prevent a manual collection from containing entries from many dictionaries.

Evidence: the current training selector in migration 140 accepts one list ID and
type, and sessionResumeStore likewise stores one listId. Collections can eventually
hide a union behind one published membership, so training does not inherently
need a multi-source selector. However, the new collection layer must still solve
multi-parent refresh consistency, deduplication, shared dependencies, partial
access loss, and explanatory UI. One-source derived collections already introduce
new rule/materialization lifecycle work; this is not merely a picker change.

Design the rule/version and dependency boundaries so a later union can feed the
same entry-membership interface. Do not implement a general expression language,
multi-parent runtime, or speculative schema solely for future flexibility.
Exact schema design belongs to the implementation plan. Acceptance covers this
staging decision; detailed multi-source behavior still requires its own decisions.

## C20 — Encounters require explicit interaction in the first release (accepted)

Owner confirmation: “Да, принимаем.” on 2026-09-20.

In the first release, “encountered recently” means a recorded explicit user
interaction with the word, such as selecting it in a YouTube video to inspect
its meaning. Merely appearing in subtitles or other viewed material is not
sufficient evidence of an encounter. “Marked forgotten” remains a separate,
narrower event condition.

Example: bread explicitly selected yesterday can match “encountered in the
last seven days”; corn merely present in the viewed video does not.

This is a product eligibility definition, not permission to add mutation to
ordinary read-only lookup. Event recording, identity resolution, and exact
qualifying action mappings require an explicit Platform contract consistent
with the platform engineering principles.

## C21 — Forgotten events target the meaning explicitly selected by the user (accepted)

Owner clarification on 2026-09-20: the user selects the specific dictionary
meaning from lookup results and explicitly marks that meaning forgotten.

Record the forgotten event against that selected dictionary entry identity.
Do not infer a meaning solely from the clicked spelling, automatically select
one for this action, or propagate the event to other meanings or entries with
the same spelling. Recent-forgotten training filters match that selected entry.

Example: selecting bank in the bench sense and marking it forgotten does not
mark the financial-institution sense forgotten.

This settles entry identity for the explicit forgotten-action workflow. C27
settles reuse of normal FSRS action semantics. The concrete exercise target
and server-issued action capability still determine direction and valid action;
no update to every direction or every meaning is implied.

## C22 — Learning state and review readiness belong to training (accepted)

Owner confirmation: “Да, конечно, принимаем. Так и есть.” on 2026-09-20.

Selection by learning state (new, learning, learned) or review readiness belongs
to Training Setup and its scheduling semantics, not collection membership rules.
Collection membership therefore does not change solely because an answer changes
learning state or a scheduled review becomes due.

Example: “VanDale 2k verbs” keeps its membership after a successful answer;
training determines which entries and exercise targets are eligible now.
This complements C7's training-only rolling time filters and preserves the
separation between saved material and per-user learning progress.

## C23 — Provenance collections accumulate explicitly marked meanings (superseded by C24)

Initially confirmed on 2026-09-20. Subsequently reopened by the owner's
clarification rejecting history-based collections and a separate history source.
The proposal below is retained as discussion history, not an implementation
requirement. C24 subsequently rejects this collection capability.

A rule-based collection such as “Words from Video A” contains specific dictionary
meanings explicitly marked by the user in that source, based on corresponding
recorded events. The rule has no rolling time restriction. New qualifying marks
update membership; a later successful review does not remove an entry.

Repeated marks of the same entry create distinct history events for distinct
user actions, but do not duplicate that entry in collection membership.
Transport retries remain subject to normal action idempotency.

The same model applies to other encounter sources. A training launched from
this collection may additionally apply a recent-event condition under C7–C10.
Merely appearing in the video's content does not confer membership (C20/C21).

### Owner correction following C23

The selected meaning always belongs to a dictionary (including a personal
dictionary). History records the user's interaction with that entry; it is
not a third content source. The proposed addition of history as a third source
was rejected. Training can dynamically filter dictionary/collection entries
using their recorded events and the requested period, as in C7–C10/C18/C21.

The owner's subsequent confirmation in C24 reserves history conditions for
training. C25 establishes the need for cross-dictionary training; the extent
of any revision to C19's collection scope still needs confirmation.

## C24 — All user-history filters belong to training and presets (accepted)

Owner confirmation: “Принимаем.” on 2026-09-20.

Conditions on user actions, including encounter provenance, action type, and
event time, belong exclusively to training selection and saved training presets.
Do not create rule-based collections from user history, even without a rolling
time window. Collection rules select by dictionary-entry properties and source
collection membership. History is evidence used to filter content, not a third
content-source type. This supersedes C23 and extends C7/C22.

A “Words from Video A” workflow is represented by training configuration or
a preset with a Video A event condition, not an implicit history-based collection.

## C25 — Training must support marked entries across dictionaries (accepted need)

On 2026-09-20 the owner explicitly identified multi-source support as necessary:
marks from one YouTube video may reference VanDale entries and entries created
manually or with AI in a personal dictionary. A single-dictionary restriction
would omit part of the intended material.

Plan cross-dictionary training selection so this workflow can include the
selected entries from both dictionaries, subject to access and normal training
eligibility. History conditions continue to filter dictionary-backed entries
under C24; no materialized history collection is needed.

C26 settles first-release scope and dictionary selection. C19 remains in force
for collection composition.

## C26 — Multiple dictionaries in training; one source per rule-based collection (accepted)

Owner confirmation: “Хорошо, принимаем.” on 2026-09-20.

The first release supports multiple dictionaries in Training Setup and presets,
including “All accessible dictionaries” with an explicit option to narrow the
selection. Rule-based collections retain one source under C19; multi-source
collection composition remains a later stage.

Owner example: door and mouse are marked in a YouTube video using entries from
a shared dictionary; furniture is created in the personal dictionary and marked
in that same video. Training over all accessible dictionaries with the relevant
video-event condition can select all three specific entries. Creating the
personal entry alone must not imply a video mark: that association requires a
recorded interaction linked to the entry and video. A rolling period is optional.

Matching these conditions forms the entry pool; actual exercise selection still
depends on training mode, scheduling, and size. Source provenance belongs to
the user's recorded interaction, not a single global video field on the entry.

## C27 — External card grades use normal learning mutations and atomic provenance (accepted)

Owner clarification on 2026-09-20: the video interface shows the same learning
card in a different presentation; its four answer grades use the normal FSRS
mechanism and record the video, word/meaning, and action in history.

An explicit grade uses the same canonical action and target semantics as the
equivalent ordinary card interaction. Update existing learning state and append
source-linked history atomically. Do not create a new card identity or separate
YouTube-specific FSRS state. Plain lookup remains read-only.

Ordinary state is per user, entry and card type/direction, not one global counter
per spelling. Content-bound targets follow ADR 0011. The client uses server-issued
capabilities and valid actions for the actual card state; it must not reinterpret
“remembered” as V2 mark-known or “forgotten” as a new invented action based only
on a label. Existing V2 grade semantics are authoritative. Connected-client
authority remains distinct from first-party session authority.

The historical event retains the actual context and can be queried for entry
IDs. Later training joins those IDs to accessible content and scheduler state.
Repeated delivery of one action changes state/history only once; separate user
actions are separate events. History from another user cannot qualify an entry.

### Grade vocabulary clarification

The four answer buttons map to the existing review result values and must be
stored/queryable without inventing parallel history actions:

| Product label | Canonical review result | FSRS grade |
| --- | --- | --- |
| Again / forgotten | `fail` | 1 |
| Hard | `hard` | 2 |
| Good | `success` | 3 |
| Easy | `easy` | 4 |

“Any answer” means a `review-card` event with any one of these four results;
“Again”/“forgotten” means only `review-card` with result `fail`. Those explicit
grade predicates must not be approximated by lookup, reveal, `record-view`,
`start-learning`, Known mark, or other event-row existence. Separately, the
current first-release history-presence condition used by training means that
some event row exists for the exact entry/card target (and matching source and
time when requested); that broader condition intentionally treats any recorded
action as an encounter. If a positive-recall predicate is exposed, it means
`hard|success|easy`, not `fail`.

This distinction removes the earlier ambiguity around “viewed” versus “graded”:
presence-of-any-event is the current broad encounter filter, while action/result
filters are a follow-up capability. Source, time, entry/card target and result
must still match the same event whenever a grade predicate is used.

## C28 — Partial dictionary access permits a disclosed reduced training scope (accepted)

Owner confirmation on 2026-09-20: allow available dictionaries with a notice
that some materials were excluded because not all sources are currently accessible.

For multi-dictionary training, exclude inaccessible material and allow training
from the accessible eligible subset, with a clear partial-availability notice.
Preserve configured sources in the preset; temporary unavailability must not
silently rewrite its saved recipe. This qualifies C17: it does not permit using
the unavailable source itself or broadening selection to unselected sources.

If none of the selected material is accessible, no session can draw from it.
If accessible material exists but nothing is due/eligible, report that distinct
outcome. Do not treat either case as a successful completed workout.
Source restoration and entry checks retain the C17 access boundary.

## Remaining engineering and validation work

- What freshness users should expect during automatic propagation.
- Detailed change-driven refresh triggers and retry scheduling.
- Nesting limits and partial source availability for any future multi-source rules.
- Exact encounter-only interaction mappings beyond the now-fixed four-grade
  predicates, timestamp endpoints, and any calendar filters.

The companion contract enumerates unresolved engineering boundaries explicitly.
Implementation and empirical acceptance follow the linked validation plan;
this document does not assert that proposed features or performance are proven.
