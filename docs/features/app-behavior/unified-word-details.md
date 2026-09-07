# Unified Word Details — routing slice

Owner: [#252](https://github.com/vbalashi/2000nl/issues/252), within #84.
This slice removes the old panel; it does not complete every Word Details state
in Pen 30.50.02 or the article-level data work in #70.

## One screen, exact selection

| Entry point | Owner | Required behavior |
| --- | --- | --- |
| Training More | TrainingDetailsDrawer → LibrarySenseCardV2Session | Open the current exact meaning; closing returns to the same training side/card. |
| Library search | LibraryWordDetail → LibrarySenseCardV2Session | One- and multi-sense groups use the same screen; never choose a renderer by meaning count. |
| List entry, desktop/mobile | LibraryWordDetail → LibrarySenseCardV2Session | Load the selected entry ID, independent of ordinary query-search tiers/pages. |

`LibraryWordDetail` owns responsive mounting only. The shared session owns
loading, the displayed group, active meaning, and meaning-scoped actions.
`LibrarySenseCardGroup` owns presentation and internal scrolling.
`LibraryDetailsActions` lays out one footer including Report; it must not
overlap content or controls at 320, 390, or 1440 CSS px.
Typography comes from the common reading-size variables, not a second Details
font scale. See [reading preferences](reading-size-preferences.md).

The shared card header, not an outer drawer shell, owns the visible word
actions. Metadata is on the left; Translate then Audio form one 40 px action
row on the right; article/headword is a separate row 12 px below it. There is
no inline audio branch and no More action inside an already-open Details view.
This same composition is used by desktop Library, mobile Library and Training
More. Exact geometry and coverage are recorded in
[`docs/design/word-details-header-2026-09/README.md`](../../design/word-details-header-2026-09/README.md).

Both mobile drawers use `WordDetailsHeader`: a separate 52 px row with a 40 px
close control, never an overlay on the card's translation control. The reading
region scrolls independently. Each edge fade is at most 44 px and at most 25%
of that region's height, leaving its middle half unobscured even on short
screens. Opening a meaning positions its beginning below the same top inset;
the selected reading size is not reduced to make content fit.

Copy and Report use the active meaning, including after cross-reference
navigation. Training Freeze/Hide is offered only for the matching current
training entry. Late completion from a previous selection must not replace
the newly opened group. Collection Open list uses the existing list owner.

## Read boundary

Authenticated dictionary Details sends `entryId` with `dictionary-lookup`
intent. Query and cursor are mutually exclusive with exact entry selection.
The existing service-only `read_platform_v2_training_group` RPC is a stable,
access-checked dictionary read despite its historical name; it does not enroll
or grade a card. The server supplies the authenticated user ID, and inaccessible
entries remain unavailable without a headword fallback. Catalog and
external-click requests do not gain exact-entry access in this slice.

Known cross-reference entry IDs use the same exact read. A reference that has
only a query/group ID retains the existing strict bounded query behavior: no
arbitrary homograph substitution and no guessed group merge. A target absent
from that page remains unavailable; complete reference resolution is not
claimed by this slice.

Loading, errors, and retry use the same new surface. There is no old-panel
fallback. Current Details requires the pilot server controls; see the
[rollout contract](../../runbooks/dictionary-search-rollout.md).

## Evidence and remaining scope

- Component tests cover single/multiple homographs, exact active meaning,
  cross-reference selection, copy, stale completion, collection navigation,
  and returning to Training.
- HTTP/client tests cover exact reads outside the query tier, denied entries,
  malformed combined selection, and public catalog restrictions.
- Browser tests mount the real Details modules, including both mobile drawers,
  and replace only external lookup responses. They verify single/multi routing,
  selection, footer reachability, close/translation separation, and short-screen
  fade geometry at 320×568, 390×844, and 1440×960 in Normal/light and
  Largest/dark. This is not a claim of real production dictionary-data QA.
- Forms, sources, and shared notes require article identity/data work in #70;
  they must not be invented by grouping matching headword spellings.
- App-shell consistency remains #264; all remaining legacy owners remain #255.
