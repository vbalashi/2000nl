# Choosing known directions during training

Ordinary word recall has two independent manual Known marks: word to definition,
and definition to word. A Known mark means the learner already knows the answer
and does not want that direction in ordinary training. It is global to that exact
meaning (Entry), not a collection, spelling, or all meanings of a headword.
Manual knowledge does not manufacture a review grade or reset prior memory data.

The quiet **Mark as known** action opens a two-card editor in the existing card
area. The current direction is selected; the other starts with its actual state.
Each preview shows the question and answer in the appropriate order. Both preview
panels share equal height. Their status and underlined action are centred.
The editor reuses the training shell and preserves its bounds and the current
action dock height, including wrapped review controls. Next replaces the main
action in that dock. The choice group is vertically centred inside the shell.
Known state uses a quiet theme background without an accent border; status text
is stronger than the action links, and the icon follows the current theme.
Preview typography and direction arrows match the training builder.

English statuses/actions are Already know / Return to learning and Still learning /
Mark as known. Russian uses Уже знаю / Вернуть в обучение and Ещё изучаю /
Отметить знакомым. Dutch and Ukrainian are supplied in the interface catalogs.

The editor is a local draft. Go back cancels without a learning write and restores
the existing card side. Next atomically saves both desired marks and consumes the
current member once. It is not an FSRS review. Failed saves remain visible; an
uncertain request freezes its event ID and entire payload until reconciled.
A committed save followed by failed next-card loading retries presentation only.
Changing owner, entry, direction or session discards the old local editor.

The authenticated first-party `/api/training/known-choice` boundary derives its
principal on the server. The RPC checks the active run, current ordered member,
entry access and the revision of both directions. It owns the marks, receipt and
member consumption in one transaction. A choice within the active session keeps
its frozen plan: all existing members, ordinals and unrelated state remain intact.
The current member is consumed once. If its other direction is selected as Known
and still pending in that session, it is marked unavailable with reason `known`;
it is not counted as an answered card and no replacement is added. Returning a
Known direction does not add it back into the current run. When no pending members
remain, the session completes through the existing exhausted-pool behavior.
This action does not increment the external plan revision or trigger a replan.
The periodic authority check still handles genuine external changes. Other directions of the meaning must pass
through the authoritative selector after commit; a cached sibling cannot bypass
its new Known state.

## Existing exclusions

Active ordinary meaning exclusions are reinterpreted as Known in both directions.
Historical exclusion events and receipts are retained. Conversion records the
original exclusion ID, exact Entry and only the Known marks introduced by that
conversion. Existing Known marks and all review history remain unchanged.
Restored exclusions are not reactivated. Exact legacy undo never clears a later
replacement mark or a mark that existed before the exclusion.

Migration 365 supplies a bounded operator conversion function. It is intentionally
not executable by web-server or browser roles. On a fresh install there is no
historical data to convert. A managed deployment requires a separately reviewed
private forward migration and release authorization. Run the converter in bounded
transactions, reconcile outstanding active exclusions and investigate inaccessible
or archived entries before declaring migration complete. Never silently discard
unconverted records. Compatibility calls from older ordinary Exclude clients
create the same Known marks while retaining their original receipt identity.

Independent content-bound idiom/translation exercises and audio have distinct
identity and state owners. They must not acquire ordinary Entry Known marks merely
because their parent meaning is known. No temporary freeze action is introduced
by this editor.
