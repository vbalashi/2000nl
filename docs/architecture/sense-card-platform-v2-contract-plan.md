# SenseCard Platform V2 Contract Plan

Status: approved by two independent architecture reviews for issue #69
Date: 2026-07-29
Implementation issue: #70

## Outcome

2000NL publishes one semantic presentation contract that both 2000NL and
AudioFilms can consume without reading provider `raw`, parsing labels, deriving
groups from text, or joining translations by array position.

The products keep separate renderers and surrounding UX:

```text
2000NL dictionary + learning authority
                |
                v
        Platform V2 semantic DTO
          /                    \
         v                      v
  2000NL renderer       AudioFilms backend adapter
                                |
                                v
                      AudioFilms extension renderer
```

The contract describes meaning, content, state, targets, and message keys. It
does not prescribe CSS, component implementation, extension chrome, or the
2000NL application shell.

## Non-Negotiable Invariants

1. One persisted Dictionary Entry is one learnable Dictionary Meaning.
2. One SenseCard is `(entryId, cardTypeId)` plus the current user's state and
   permitted actions.
3. A Headword Group is presentational and never a learning target.
4. Platform owns group, entry, Content Node, translation, and action identity.
5. Lookup is read-only.
6. Human-language labels are never identifiers.
7. `interfaceLanguageCode`, `contentLanguageCode`, and
   `translationTargetLanguageCode` remain independent.
8. Source paths, visible text, list names, POS labels, and array order are not
   identity.
9. Rich dictionary data is optional Word Details, not automatic default-card
   content.
10. V1 remains semantically unchanged for existing representable states while
    V2 consumers migrate; an active V2 Known Mark adds only the fail-closed
    interoperability guard defined below.
11. Principal identity and client scopes are derived and enforced server-side;
    request JSON never selects a user or grants a capability.

## Reconciled Current-State Findings

### 2000NL

- V1 emits one lookup item per meaning-level `word_entries.id`.
- `content.sections[].id` and `sourcePath` are currently position-derived.
- cached translations mirror source arrays and are rejoined through those
  paths.
- `entry.raw` remains exposed and the normalized projection omits much of the
  parser-v2 structure.
- `availableActions` is a broad technical list; card-specific capability data
  exists but is still a transition shape.
- `mark-known` currently applies an `easy` review and `mark-unknown` applies a
  `fail` review, which conflicts with the frozen reversible Known behavior.
- the source-binding ledger now supplies durable entry and source-group
  evidence for all 18,163 production corpus artifacts.

### AudioFilms

- the backend already owns a shallow `overlay-v2` projection.
- the extension correctly consumes AudioFilms rather than calling 2000NL
  directly.
- the projection still contains `raw`, ordinal, and normalized-meaning
  fallbacks needed only for V1 compatibility.
- visible action labels are currently embedded in the AudioFilms contract.
- AudioFilms search groups such as Within Examples, Within Definitions, and
  Alphabetical are discovery results, not SenseCards.

### Product/design

- the frozen SenseCard specification assigns learning state and actions to
  each meaning-level card.
- a collapsed card is entirely clickable, has no redundant disclosure button,
  and reserves no empty translation row.
- Word Details (#84), personal overrides (#87), and structured feedback (#51)
  are separate product surfaces.
- the `2K` indicator is visually group-level. The audited Van Dale corpus has
  no source article group with mixed `is_nt2_2000` values, so Platform can
  project it once without client-side aggregation.

## V2 Lookup Shape

The exact TypeScript spelling can change during implementation review, but the
ownership and cardinality below are normative.

```ts
type SemanticTermV2 = {
  termId: string;
  messageKey: string;
  sourceValue?: string;
};

type DictionarySummaryV2 = {
  dictionaryId: string;
  sourceLanguageCode: string;
  messageKey: string;
};

type PresentationIndicatorV2 = {
  indicatorId: string;
  value: string;
  messageKey: string;
};

type AudioCapabilityV2 = {
  audioId: string;
  actionId: "play-audio";
  contentLanguageCode: string;
};

type PlatformLookupV2Response = {
  contractVersion: "platform-lookup-v2";
  query: string;
  request: {
    contentLanguageCode: string | null;
    translationTargetLanguageCode: string | null;
    cardTypeId: string;
    intent: "dictionary-lookup" | "training-review" | "external-click";
  };
  groups: HeadwordGroupV2[];
  page: {
    selectedTierComplete: boolean;
    nextGroupCursor: string | null;
  };
};

type HeadwordGroupV2 = {
  headwordGroupId: string;
  dictionary: DictionarySummaryV2;
  header: HeadwordHeaderV2;
  senseCount: number;
  entryCount: number;
  indicators: PresentationIndicatorV2[];
  entries: EntryPresentationV2[];
};

type EntryPresentationV2 =
  | SenseCardEntryV2
  | CrossReferenceEntryV2;
```

Lookup returns explicit groups. The client does not regroup a flat `items[]`
array. Separate homographs and dictionaries can produce adjacent groups with
the same visible headword. The request requires one `cardTypeId`, and every
returned SenseCard echoes it. Catalog and authenticated lookup use the same
selection rule; catalog simply has no user state or mutations.

Pagination is opaque and group-atomic. A response never splits a Headword
Group or silently truncates its entries to satisfy an item limit.
`selectedTierComplete` says whether all groups in the selected strict-match
tier are present; `nextGroupCursor` continues with the next complete group.
If one group exceeds the documented operational safety bound, lookup returns
an explicit `group-too-large` error rather than a partial group. Contract
fixtures include the real `goed` collision set with more than ten entries for
both authenticated and catalog lookup.

`senseCount` counts only learnable `sense-card` entries.
`entryCount` includes cross-reference entries as well, so a client never has to
derive either number from rendered rows.

### Authorization and privacy

Authenticated V2 lookup and Word Details require the existing
`platform:read` scope; catalog lookup remains limited to explicitly public
catalog data. Actions, translation generation, generated-draft save, and any
future feedback submission require `platform:write`. The server derives the
user and Connected Client from authenticated state and validates every
entry/group/node target against that principal.

Private user-owned Headword Groups, entries, drafts, translations, and their
identifiers never appear in catalog lookup or another user's response.
Capabilities are computed only after authorization; their presence is not an
authorization token.

### Headword header

```ts
type HeadwordHeaderV2 = {
  text: string;
  homographNumber?: number;
  displayPronunciation?: string;
  pronunciation?: string;
  article?: string;
  partOfSpeech?: SemanticTermV2; // supplied only when uniform for the group
  audio?: AudioCapabilityV2;
};
```

`displayPronunciation` is the source-approved learner-facing form, including
pronunciation separators when available. The renderer does not insert dots
into a raw headword. Article and headword remain separate semantic values even
when a renderer places them on one typographic baseline.

Each entry may carry its own `partOfSpeech` override. Group POS is present only
when all displayed entries agree. If a source group contains incompatible
article, pronunciation, or other non-repeatable header metadata, Platform
keeps that value at entry level or splits the presentation group according to
durable source identity; the client never picks a winner.

## Persisted SenseCard Entry

```ts
type SenseCardEntryV2 = {
  kind: "sense-card";
  entryId: string;
  meaningOrdinal: number | null;
  partOfSpeech?: SemanticTermV2;
  card: {
    cardTypeId: string;
    scheduler: {
      phase:
      | "not-started"
      | "encountered"
      | "learning"
      | "reviewing"
      | "hidden"
      | "frozen";
      repeatCount?: number;
      lastSeenAt?: string | null;
      frozenUntil?: string | null;
    };
    knownMark: {
      markId: string;
      revision: string;
      markedAt: string;
    } | null;
    stateRevision: string;
  } | null;
  contentRevision: string;
  summaryContentNodeId: string | null;
  contentNodes: ContentNodeV2[];
  translation: EntryTranslationStateV2 | null;
  capabilities: SenseCardCapabilityV2[];
  wordDetails?: WordDetailsV2;
};
```

`meaningOrdinal` is a display/order hint, never identity. A single-sense group
can omit its visible number even when the ordinal is `1`.

`summaryContentNodeId` makes collapsed behavior server-owned. An entry without
a definition can select its first suitable semantic node without the client
inventing a definition.

`knownMark` is an overlay over the preserved scheduler state. It is never
encoded as a scheduler phase or review result.

Guest catalog lookup returns `card: null` and omits user mutation
capabilities. It still returns the requested `cardTypeId` in the response
request and returns the same entry and Content Node identities.

## Durable Content Nodes

```ts
type ContentNodeV2 = {
  contentNodeId: string;
  parentContentNodeId?: string | null;
  kind:
    | "definition"
    | "usage-pattern"
    | "example"
    | "idiom"
    | "idiom-explanation"
    | "usage-note";
  order: number;
  text: string;
  sourceTextFingerprint: string;
  translations: ContentNodeTranslationV2[];
  sourcePath?: string; // diagnostics only
};
```

Nested idiom examples and explanations use `parentContentNodeId`; clients do
not pair entry-level arrays heuristically.

The binding store owns:

- `entryId`;
- `contentNodeId`;
- semantic kind and optional parent binding;
- binding state;
- first/last source revision;
- source-native identity evidence when available;
- current source-text fingerprint;
- diagnostic locator;
- reconciliation decision.

Reordering preserves IDs only when source-native identity or unambiguous
semantic evidence proves continuity. A text edit can preserve the node ID
while changing its fingerprint. Indistinguishable duplicate nodes without
such evidence are never paired by position: affected old bindings are retired
and new nodes receive new IDs. Removed nodes are omitted from active lookup,
while historical feedback and action records retain resolvable identity.

## Translation

```ts
type ContentNodeTranslationV2 = {
  translationId: string;
  targetLanguageCode: string;
  status: "ready" | "pending" | "failed" | "not-available";
  text?: string;
  sourceTextFingerprint: string;
  translationPolicyVersion: string;
  providerRevision?: string;
  errorCode?: string;
};

type EntryTranslationStateV2 = {
  translationId: string;
  entryId: string;
  targetLanguageCode: string;
  status: "ready" | "pending" | "failed" | "not-available";
  text?: string;
  sourceContentFingerprint: string;
  translationPolicyVersion: string;
  providerRevision?: string;
  errorCode?: string;
  isFresh: boolean;
};

type PlatformTranslationV2Request = {
  clientRequestId: string;
  entryId: string;
  contentRevision: string;
  targetLanguageCode: string;
};
```

Every translation is attached directly to its Content Node. A translation is
renderable only when its `sourceTextFingerprint` matches the node. Whole-entry
source fingerprint and translation policy version are separate fields.

`EntryTranslationStateV2` is the optional short translation of the Dictionary
Meaning shown near the meaning header. It is not a translation of the selected
definition and is never reconstructed from node translations.

`POST /api/platform/v2/translation` operates on an explicit persisted
`entryId`, requested target language, and current content revision. Its result
returns the entry translation and the same node-bound objects. Array overlays
and loose `sourcePath` tuples are not part of V2. A stale fingerprint or policy
version makes the corresponding artifact non-renderable until refreshed.
`clientRequestId` makes generation retries idempotent; a stale
`contentRevision` fails without charging or persisting a translation for the
wrong source.

Translation off/on remains local view state. Turning it on reveals already
returned ready values or triggers the explicit translation operation; lookup
itself does not perform a paid generation call.

## Actions And Capabilities

The DTO exposes permitted semantic capabilities, not an all-purpose list of
technical endpoint operations. Every capability is discriminated by action, so
an invalid action/target/parameter combination cannot be represented.

```ts
type SenseCardTargetV2 = {
  kind: "sense-card";
  entryId: string;
  cardTypeId: string;
  stateRevision: string;
};

type EntryTargetV2 = {
  kind: "entry";
  entryId: string;
  contentRevision: string;
};

type ContentNodeTargetV2 = {
  kind: "content-node";
  entryId: string;
  contentNodeId: string;
  sourceTextFingerprint: string;
};

type TranslationTargetV2 = {
  kind: "translation";
  entryId: string;
  translationId: string;
  contentNodeId?: string;
  sourceTextFingerprint: string;
};

type SenseCardCapabilityV2 =
  | {
      actionId: "start-learning" | "mark-known";
      elementId: string;
      messageKey: string;
      target: SenseCardTargetV2;
    }
  | {
      actionId: "undo-known";
      elementId: string;
      messageKey: string;
      target: SenseCardTargetV2 & {
        activeKnownMarkId: string;
        knownMarkRevision: string;
      };
    }
  | {
      actionId: "review-card";
      elementId: string;
      messageKey: string;
      target: SenseCardTargetV2;
      reviewResult: "fail" | "hard" | "success" | "easy";
    }
  | {
      actionId: "request-translation";
      elementId: string;
      messageKey: string;
      target: EntryTargetV2;
      targetLanguageCode: string;
    }
  | {
      actionId: "report-content";
      elementId: string;
      messageKey: string;
      target: EntryTargetV2 | ContentNodeTargetV2 | TranslationTargetV2;
    }
  | {
      actionId: "open-word-details";
      elementId: string;
      messageKey: string;
      target: EntryTargetV2;
    };

type PlatformActionV2Request =
  | {
      actionId: "start-learning" | "mark-known";
      clientEventId: string;
      target: SenseCardTargetV2;
      sourceContext?: PlatformSourceContextV2;
    }
  | {
      actionId: "undo-known";
      clientEventId: string;
      target: SenseCardTargetV2 & {
        activeKnownMarkId: string;
        knownMarkRevision: string;
      };
      sourceContext?: PlatformSourceContextV2;
    }
  | {
      actionId: "review-card";
      clientEventId: string;
      target: SenseCardTargetV2;
      reviewResult: "fail" | "hard" | "success" | "easy";
      sourceContext?: PlatformSourceContextV2;
    };

type PlatformActionV2Response = {
  contractVersion: "platform-action-v2";
  actionId: "start-learning" | "mark-known" | "undo-known" | "review-card";
  clientEventId: string;
  accepted: boolean;
  card: NonNullable<SenseCardEntryV2["card"]>;
};
```

`POST /api/platform/v2/actions` accepts only mutation variants.
`clientEventId` is required for every mutation and is the idempotency key.
The endpoint returns the resulting card state for the same exact target.
An identical canonical-payload retry returns the original action/provenance
result. Reuse of the key with a different action, target, review result, or
normalized source context returns `idempotency-conflict` and performs no
write. A stale `stateRevision`, stale `knownMarkRevision`, or non-current
`activeKnownMarkId` also returns a typed conflict and performs no write.

`sourceContext-v2` is optional for first-party actions without external source
provenance and required for source-aware actions. AudioFilms sends the binding
frozen at click time. The idempotency fingerprint includes action, target,
review result, and normalized canonical source/artifact/location/selection,
while excluding observation and diagnostics. Card mutation, immutable action
event, and normalized provenance persistence succeed or fail atomically.

Review buttons are separate presentation elements but share the
`review-card` command with an explicit result. Each mutation targets one exact
SenseCard. A future group operation must carry an explicit set of
entry/card targets; the backend never rediscovers targets from display order.

The quiet expanded-card Report action targets its entry and, when relevant, a
Content Node or translation. Report and Word Details are
navigation/operation capabilities, not `/actions` mutations. A collapsed card
has no per-node Report action. Initial V2 exposes no group-wide action; any
future one must have a typed `headwordGroupId` target and authorization rule.

### Known and undo

Platform V2 uses the durable Known Mark defined by ADR 0004:

- `mark-known` does not grade the card;
- `undo-known` atomically clears only the current mark in the database and
  reactivates the scheduler state preserved when the mark was created;
- both operations are atomic, idempotent, and historically auditable;
- stale state revisions or stale undo targets fail explicitly;
- review/start-learning while actively known is rejected until the mark is
  undone.

The implementation is tracked separately by #89 so #76 cannot accidentally
simulate this behavior in UI code.

## Localization

Platform emits stable semantic IDs and message keys, never already-localized
button or section labels.

```text
semantic data
  -> element/action ID
  -> local view state
  -> message key + interfaceLanguageCode
  -> visible copy and aria label
```

`interfaceLanguageCode` is resolved through the user/session preference
contract (#52) and belongs to renderer context. It is not inferred from
dictionary content or translation target language.

Each consumer owns a locale catalog implementing the shared keys. Contract
fixtures verify key coverage for supported locales. Narrow and full renderers
may use different explicitly named keys when copy length genuinely differs;
they do not truncate or translate backend labels.

## Field And Indicator Ownership

| Visible concern | Stable element/value | Owner | Client behavior |
| --- | --- | --- | --- |
| headword group | `headwordGroupId` | Platform projection backed by explicit group identity | never group by text |
| headword | `header.text` | Dictionary Entry group projection | render supplied value |
| pronunciation separators | `header.displayPronunciation` | Platform/source projection | never synthesize from spelling |
| article | `header.article` | Platform/source projection | local layout only |
| part of speech | uniform group term or entry override | Platform | localize its message key; never choose a winner |
| 2K indicator | indicator ID `core-vocabulary`, value `nt2-2000` | Platform group projection | render once when supplied |
| meaning count | `senseCount` | Platform group | locale pluralization from key |
| meaning number | `meaningOrdinal` | entry presentation | hide for one-sense group |
| New/repeat count | `card.scheduler.phase` / `repeatCount` | exact SenseCard state | never aggregate across entries |
| Known/undo | `card.knownMark` / exact mark ID and revision | exact SenseCard state | never synthesize from a review result |
| definition/pattern/example/idiom | `contentNodeId`, `kind`, `text` | Dictionary Entry content | structure from kind/parent |
| translation | `translationId`, `contentNodeId`, target and fingerprints | Platform translation artifact | no ordinal join |
| audio | typed audio capability | Platform | invoke only supplied capability |
| learn/review/known | action ID plus exact SenseCard target | Platform | render only supplied capability |
| report | action ID plus entry/node/translation target | Platform | no guessing from open group |
| More / Word Details | entry capability | Platform supplies availability; client owns opening state | rich content not inside the menu |

## Cross-References

Cross-reference-only source records are not Dictionary Meanings and never
become SenseCards.

```ts
type CrossReferenceEntryV2 = {
  kind: "cross-reference";
  crossReferenceId: string;
  label: SemanticTermV2 | null;
  text: string;
  target: {
    query: string;
    headwordGroupId?: string;
    entryId?: string;
  };
  capabilities: Array<{
    actionId: "follow-cross-reference";
    elementId: string;
    messageKey: string;
  }>;
};
```

The target contains a durable Platform ID when the referenced source record is
resolved; otherwise it contains an explicit strict-lookup query. A
cross-reference contributes to `entryCount`, not `senseCount`, and exposes no
learning, Known, review, translation, or Word Details capability.

## Optional Word Details

Parser-v2 structured fields are projected into a minimal typed
`wordDetails` object so clients never read `entry.raw`.

```ts
type WordDetailsV2 = {
  entryId: string;
  lexicalRelations: Array<{
    relationId: string;
    kind: "synonym" | "antonym";
    text: string;
    targetEntryId?: string;
  }>;
  labels: SemanticTermV2[];
  grammarNotes: DetailTextV2[];
  usageNotes: DetailTextV2[];
  pronunciationNotes: DetailTextV2[];
  forms: Array<{
    formId: string;
    kind: SemanticTermV2;
    text: string;
    features: SemanticTermV2[];
  }>;
  references: Array<{
    referenceId: string;
    kind: SemanticTermV2;
    text: string;
    targetEntryId?: string;
  }>;
};

type DetailTextV2 = {
  detailId: string;
  text: string;
  contentNodeId?: string;
};
```

Meaning-level lexical relations, labels, grammar, notes, pronunciation notes,
and forms remain tied to `entryId`. A detail that elaborates a definition,
idiom, or other visible node additionally carries `contentNodeId`. Homograph
membership is represented by Headword Groups and independent entries, not a
duplicated `homonyms[]` array. Initial V2 omits source structures that cannot
be assigned to one of these typed owners; it never exposes `unknown` or `raw`.

The default SenseCard ignores `wordDetails` except for the
`open-word-details` capability. Layout and navigation are owned by #84.

## Generated Drafts

A lookup miss does not create a canonical Dictionary Meaning and is not
returned as an `EntryPresentationV2`.

```ts
type GeneratedDraftV2Response = {
  contractVersion: "platform-generated-draft-v2";
  draftSetId: string;
  candidate: {
    candidateId: string;
    revision: number;
    draftGroupId: string;
    header: HeadwordHeaderV2;
    contentNodes: DraftContentNodeV2[];
  };
  capabilities: Array<{
    actionId: "save-generated-draft";
    elementId: string;
    messageKey: string;
    target: {
      kind: "generated-draft";
      draftSetId: string;
      candidateId: string;
      revision: number;
    };
  }>;
};

type SaveGeneratedDraftV2Request = {
  clientRequestId: string;
  target: {
    kind: "generated-draft";
    draftSetId: string;
    candidateId: string;
    revision: number;
  };
};

type DraftContentNodeV2 = Omit<
  ContentNodeV2,
  "contentNodeId" | "parentContentNodeId" | "translations"
> & {
  draftContentNodeId: string;
  parentDraftContentNodeId?: string | null;
  translations: ContentNodeTranslationV2[];
};

type SavedGeneratedDraftV2 = {
  draftSetId: string;
  candidateId: string;
  revision: number;
  headwordGroupId: string;
  entryId: string;
  contentNodeMappings: Array<{
    draftContentNodeId: string;
    contentNodeId: string;
  }>;
};
```

The generated-draft endpoint owns this separate response. Draft group/node IDs
are private and stable only inside one candidate revision. Explicit save
creates one private durable Headword Group containing one user-owned
Dictionary Entry and returns the permanent IDs and mappings. Edits and renames
preserve that group; no automatic text-based regrouping occurs. Saving never
silently changes scheduler state. A `save-and-start-learning` product command
may orchestrate save followed by the explicit V2 `start-learning` mutation,
but it uses a separate observable idempotency key for each boundary.
An identical `clientRequestId` and canonical draft target returns the original
permanent group/entry/node mapping; the same key with another target conflicts.
Persistence additionally enforces one accepted save mapping per
`(principal, draftSetId, candidateId, revision)`. Draft identity is never
represented by a fake `entryId` or `meaningId = 1`.

## Future Personal Overrides

V2 never overwrites source text with a personal value. The base Content Node,
shared translation artifact, and future personal override are separate
layers, all linked through `entryId` and optional `contentNodeId`.

Issue #87 owns precedence, history, undo, privacy, and the effective-view
projection. Its eventual fields must be an additive typed layer; #70 does not
invent placeholder override JSON or mutate shared translations.

## Discovery Results Are Not SenseCards

AudioFilms and 2000NL can continue to expose Within Examples, Within
Definitions, and Alphabetical groups. These results use a separate search
contract:

- field matches target `entryId + contentNodeId`;
- entry previews carry `headwordGroupId` and `entryId`;
- result-group labels are message keys;
- no learning state/actions are inferred for a field-match row;
- selecting a result performs strict lookup/fetch before rendering SenseCards.

This preserves the useful Chrome-extension surfaces without treating every
search hit as a learning card.

## Implementation Slices

### Slice 1 — identity and fixtures

- add the Content Node binding store and reconciliation tests;
- expose public opaque Headword Group identities;
- add private user-owned group records with create/copy/save and
  rename-preservation tests;
- before V2 exposure, backfill every existing user-owned entry into exactly one
  private durable group without grouping by spelling; prove source/target
  counts, uniqueness, ownership, and cross-user privacy;
- generate immutable real-data fixtures covering single sense, multi-sense,
  homographs, missing definition, Usage Pattern, nested idiom examples,
  rich details, cross-reference, generated draft, mixed POS, a lookup tier
  above ten entries, and duplicate/reordered content;
- prove reorder stability, ambiguity handling, and stale translation
  invalidation.

### Slice 2 — pure Platform V2 projection

- add V2 TypeScript types and a pure projection module;
- keep V1 projection untouched;
- remove `raw` and positional identity from the V2 public shape;
- add field/message-key/target mapping tests.

### Slice 3 — V2 routes and translation

- publish authenticated and catalog lookup routes;
- require `cardTypeId` and group-atomic completeness in both routes;
- publish node-bound translation response/write flow;
- add snapshot, auth, privacy, latency, and no-mutation tests;
- document compatibility and deprecation telemetry.

### Slice 4 — mutation boundary

- #89 adds durable Known Mark state and immutable action events;
- publish `/api/platform/v2/actions` only after #89 passes database
  mark/undo, stale-write, retry, and state-restoration tests;
- advertise Known/undo capabilities only while the V2 action boundary is
  enabled;
- keep V1 action IDs/mappings unchanged for cards without a V2 Known Mark;
  shared DB selection must exclude actively Known cards for both adapters, and
  legacy review/start actions against an active mark fail closed.

### Slice 5 — consumer adapters

- migrate one 2000NL single-sense reference state to the V2 DTO without
  shipping the full UI redesign;
- migrate the AudioFilms backend projection and pin the exact Platform fixture
  revision;
- keep the extension behind the AudioFilms backend;
- replace AudioFilms visible action labels with semantic IDs/message keys and
  require extension locale-catalog coverage before switching it to V2;
- delete V1 `raw`, `meanings`, same-kind ordinal, and positional translation
  fallbacks only after parity tests pass.

### Slice 6 — product tracers

- #76 implements the approved 2000NL single-sense tracer;
- the corresponding AudioFilms issue implements the approved narrow extension
  state;
- #84 and #87 remain later optional surfaces.

## Validation Gates

### Contract

- JSON/TypeScript schema fixtures for every supported union;
- no `raw`, visible-label identity, source-path identity, or ordinal
  translation join in V2;
- all message keys covered for supported interface locales;
- explicit null/absence rules for optional pronunciation, audio, POS,
  frequency, translation, and Word Details.

### Identity

- reorder preserves group, entry, and node IDs when native or unambiguous
  evidence proves continuity;
- duplicate text nodes remain distinct when evidence distinguishes them;
- ambiguous duplicate sets fail closed, retire unresolved bindings, and never
  inherit identity by position;
- changed text preserves or replaces node identity only according to recorded
  reconciliation and always invalidates stale translation;
- homographs and different dictionaries never merge;
- each newly created/copied/saved user entry receives a private group and
  rename preserves it without text-based regrouping;
- every pre-existing user entry is backfilled one-to-one with count,
  uniqueness, ownership, and privacy evidence before V2 exposure;
- retired nodes disappear from active lookup but remain historically
  resolvable.

### Learning and actions

- lookup performs no writes;
- lookup requires and echoes one `cardTypeId`;
- catalog/authenticated lookup return complete groups and explicit
  completeness metadata above ten entries;
- every action carries an exact target and current state revision;
- capability schema rejects invalid action/target/parameter combinations;
- per-entry card state remains independent inside a multi-sense group;
- Known/undo database tests pass before UI completion;
- undo proves that the preserved prior scheduler state becomes active again;
- external retries cannot duplicate FSRS or action history.
- identical retries return the original action/provenance or draft-save result,
  while same-key/different-payload requests conflict without writes;
- AudioFilms frozen source bindings persist atomically with the accepted
  action, including failed/stale-action tests.

### Consumers

- one immutable fixture suite is consumed by both repositories;
- 2000NL and AudioFilms snapshots cover the same semantic states while keeping
  local layout;
- AudioFilms extension tests prove no direct Platform call and no local state
  simulation;
- Chrome smoke and 2000NL responsive visual QA use the approved Pen references.

## Rollout And Rollback

- The server deploys V2 additively first, with V1 continuously available.
- 2000NL and AudioFilms gain independently switchable V1/V2 adapters. Each
  adapter passes the shared fixtures and production smoke before its switch is
  enabled.
- AudioFilms switches only after its backend emits semantic IDs/message keys
  and its extension resolves visible and accessible copy locally.
- Consumers switch and are observed independently. A renderer consumes one
  contract version for a card; it never mixes V1 and V2 nodes/actions.
- During the rollback window, disable the affected consumer switch before
  disabling any V2 route. Keep the V1 adapter deployable until all consumers
  have completed the agreed observation window.
- V2 Known capabilities are gated by `PLATFORM_V2_ACTIONS_ENABLED` and appear
  only when migration `109` and `/api/platform/v2/actions` are deployed
  together. Rolling back the UI never rewrites or deletes an
  accepted Known Mark. Shared scheduling excludes active marks even when a
  consumer is on V1, and legacy review/start mutations fail closed for such a
  target. The rollback matrix includes an active-Known fixture.
- Before any external V2 exposure, projection can be rolled back by disabling
  V2. After group/node IDs are emitted into translations, feedback, or action
  history, rollback retires/disables bad bindings and rolls forward; it never
  reassigns an emitted ID.
- The deployment matrix is tested for server V1-only, server V1+V2 with each
  consumer on V1, one consumer on V2, both consumers on V2, and consumer-first
  rollback.
- V1 retirement needs a separate usage inventory and decision.

## Explicit Deferrals

- shared runtime renderer or cross-repo component package;
- final Word Details UI (#84);
- personal definition/translation override semantics (#87);
- feedback persistence/review queue (#51);
- named reusable Training Plans;
- AudioFilms non-extension UI;
- FSRS algorithm changes;
- V1 retirement.

## Gate To Start #70

#70 can move to Ready only after:

1. ADR 0004 and this plan pass two independent reviews using the same evidence;
2. every P0/P1 review comment is resolved or explicitly deferred with an owner
   and issue;
3. the implementation slices and rollback boundary remain narrower than the
   product UI work;
4. the product owner accepts any newly exposed product tradeoff.
