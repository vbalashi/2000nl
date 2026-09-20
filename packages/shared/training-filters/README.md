# Training filter profiles

`nl.v1.json` is the first declarative Training Setup profile. It describes the
groups, fields, options, dependencies and defaults used to generate a setup UI
for Dutch learning material. It is a target product contract; the renderer must
show only fields and options whose `availability` is `available`.

## Semantics

- A preset stores selected stable field and option IDs, not runtime values and
  not a materialized queue. The renderer resolves each option's `value` only
  when it prepares a server request.
- A new session resolves the selected material, checks current access and
  evaluates the filters again. The resulting session queue is then latched.
- Empty optional fields add no restriction.
- Values selected within one `multiple` field are combined with OR.
- Different fields are combined with AND.
- If a selected lexical filter depends on missing metadata,
  `exclude-when-filtered` excludes that entry instead of guessing.
- `visibleWhen` controls presentation and validity together. When
  `clearWhenHidden` is true, a renderer must remove a now-inapplicable value.
- Labels are localization keys. The learning-language profile must not force the
  interface language.
- Material values use stable catalog keys, never database UUIDs. The server-side
  resolver remains responsible for access and for mapping those keys to current
  dictionary/list identities.

## Availability

- `available`: may be rendered and saved now.
- `gated`: runtime groundwork exists, but the product entry point is disabled.
- `planned`: accepted direction, without a complete runtime path yet.
- `deferred`: deliberately outside the current VanDale/2K milestone.

The current profile therefore renders VanDale material, Dutch lexical filters,
queue policy, ordinary word-card direction and session size. Idiom and Example
sentences families, typed answers and activity/history filters remain visible
in the contract without leaking into the initial UI. “Example sentences” is the
user-facing family name; its runtime value remains `sentence-translation`
because each exercise is bound to one exact example Content Node.
