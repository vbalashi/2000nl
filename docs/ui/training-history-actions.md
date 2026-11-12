# Recent training history: action identity and integration

The recent history projection merges the learner's accepted actions and review
results into one bounded, reverse-chronological list. A meaning is identified by
`entry_id`, not by headword or by an ordinal inferred from the current view.
The history shows the currently available definition without requesting a
translation; this is not a snapshot of what the learner saw when the event was
recorded. All history branches, including the legacy v1 read used by v2,
authorize the individual entry before ordering and limiting. A live shared
author entry remains visible to an eligible subscriber; after the last access
path is revoked it is withheld. An archived author entry remains in its owner’s
history without definition or exercise text, but not in a subscriber’s history.
A malformed user entry without a dictionary fails closed. Opening a row passes the entry's own content language to the library.
The meaning badge uses source-group identity and its recorded ordinal, never the
position of a history row. It is shown only for a complete, accessible group of
2–50 active entries with distinct, consecutive ordinals. Otherwise it is hidden.
This is current dictionary numbering, not an event-time snapshot. The badge
shares the training-card visual and uses a history-specific explanation.

Known and undo-known actions include their recorded direction. Historical
meaning-wide exclusions cover both ordinary directions; the original action and
its timestamp remain in history. Pair exclusions of exercises do not reliably
record an individual direction, so the projection does not invent one. A
conversion of a historical exclusion to Known creates bookkeeping marks; their
mark events are suppressed and a later independent undo is retained. A restore
through the legacy exclusion route produces one historical restore, not the
additional bookkeeping undo events.

The in-progress known-choice operation creates one action event per changed
direction. Thus choosing both directions currently yields two truthful rows;
its receipt does not identify the generated action events. Do not group rows by
matching timestamps: a single combined history row needs an explicit durable
link between the choice receipt and the action events. Reconcile this before the
combined release if one row for both directions is required.

Migration 366 is the public fresh-install projection. The separate managed
forward SQL and rollout sequencing belong to the managed release workspace.
Validate it against the finally selected known-choice migration and its
conversion contract before applying it. No application publication authorizes
that database change or a deployment.
