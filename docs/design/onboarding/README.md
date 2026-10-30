# Progressive onboarding — proposal for #9

Status: **design for owner review, not accepted or implemented**. 2026-10-30.
Baseline audited: `d72b9d5e1d65dbee2d86abea619a701d8ece7d62`.
Issue: https://github.com/vbalashi/2000nl/issues/9.

Start with [the interactive concept](prototype.html), [draft copy](copy.json),
and [current-product evidence](audit.md). The concept uses independently written
examples and simulated learning; it never connects to an account or database.

## Proposed decision

Use **two initial stages**, followed by an optional Library task:
introduce the already saved training, then learn two real meanings. Offer a
third card only if the learner wants to continue. Do not require collection
creation to finish the introduction. A one-to-two-minute first useful result
is a hypothesis; no beginner timing study has been performed.

The existing five-step Joyride cannot be used as the starting flow. Its launch
is disconnected and three targets are absent. The language functionality inside
its hook is live and must survive any cleanup. See the removal plan in the audit.

## Required starting contract with #8

Before showing the introduction, load authoritative account defaults and source
availability. A new eligible account must have at least one **named, saved,
editable** training whose material is the enabled primary Dilum Nederlands
dictionary, and whose ID is selected as primary. “Dilum NL” below is the proposed
training label, not a new source identity. Render the actual saved name.

Reload and a fresh sign-in must retrieve the same training ID, name, selected
primary ID and material. A calculated current-setup card alone does not meet
this requirement. Existing accounts retain their choices. Van Dale is not an
initial suggestion. This design does not edit defaults, source setup, seeding,
schema or managed data. Recheck against #8's final revision before implementation.

Do not silently shorten, rename or overwrite the saved training to fit the
introduction. Two successful learning actions end the guidance, not the actual
session. Its remaining cards remain available. A resumed existing session takes
precedence over orientation.

## Step map

| Step | Surface / learner action | Explain | Exit / durable result |
| --- | --- | --- | --- |
| 0 readiness | Existing startup gate resolves defaults + access + session | No concepts while loading | Resume existing session; or show 1; recoverable error stays retryable |
| 1 orient | One small inline panel beside the primary saved training; Start / Skip introduction | Dictionary supplies meanings; training is ready; no setup required | Start invokes the real saved training; skip hides guidance and leaves Start available |
| 2a do | Existing card front; think, then Show answer | One short instruction next to the existing action, no modal overlay | Reveal advances guidance only; no learning write yet |
| 2b understand | Existing answer, definition and example; Learn | This card is one meaning; inspect example; Learn starts its learning | Advance only after acknowledged real action, not click or timer |
| 2c repeat | Second real meaning, same controls | No additional popup; brief optional hint | Two acknowledged actions finish core guidance; session continues unchanged |
| 3 optional discover | Small completion invitation: Continue training / Explore Library | Library finds meanings; collections organise selected meanings | Continuing is primary; Library is optional and remembers the return path |
| 3a optional select | Library search, open an available result, inspect a meaning | One word can have several meanings; choose the one needed | Never require a fixed headword, a specific result count, or a corpus category |
| 3b optional collect | Existing Collections control on that meaning, choose/create a collection | Collection references meanings; no progress reset | Confirm membership from server; then offer training from that collection |
| later use | Training editor → Source → collection → Save/Calculate → Start | Material and direction belong to a saved training | Offer a separate saved training; do not replace primary without an explicit choice |

Keep stage 3 an invitation, not a task that makes the introduction incomplete.
Avoid all-screen spotlights: answer, Learn, exit, navigation and keyboard focus
must remain usable. In the mobile session header global Settings/Library are
hidden: offer Library only after exiting the session through the normal path.

## Content allocation

| Concept | Immediate / demonstrated | Later context | Not shown initially |
| --- | --- | --- | --- |
| Saved training | Its real name and Start | Edit/name/primary selection on opening editor | Mandatory builder or new training creation |
| Dictionary | Named source supplies meanings | Source picker: available dictionaries and access | Unavailable/disabled dictionary promotion |
| Meaning | Definition + example of the first real answer | Multiple meanings when opening a Library entry | Schema terminology and fixed sense counts |
| Learn vs review | New card: Learn | On the first actual review: Again / Hard / Good / Easy describe recall | Four ratings on a first-encounter card that has only Learn |
| Collection | Optional invitation after two actions | Membership, overlap, naming and collection training on first use | Forced naming before learning |
| Progress | An acknowledged action advances the session | Same meaning/card progress follows collection references; direction-specific cards can differ | “A new collection gives fresh progress” or a single universal score |
| Exercises | One available word direction through doing | Direct/reverse examples in editor; idiom family only when allowed and material exists | Typed answer (disabled); sentence exercises while their launch gate is off; unverified word-in-context tutorial |
| Languages/settings | Existing language, accessible Settings location | Distinguish interface, learning and translation languages in Settings | Mandatory language wizard and voice/provider configuration |
| Frequency | Nothing required | Future control: rank belongs to a chosen word/spelling profile; first-N meanings is a separate limit | Meaning frequency, invented ranks, future filter walkthrough |
| Lexical labels | Use current verified labels as content | Adopt agreed #10 terminology when available | Proposed expression taxonomy presented as accepted |

## Vocabulary boundary

Working conceptual vocabulary (not a taxonomy decision): dictionary / woordenboek /
словарь; meaning / betekenis / значение; collection / collectie / коллекция;
training / training / тренировка. A dictionary contains entries and meanings;
a collection selects references to meanings and can overlap another collection.
Training selects material and exercise/direction. Learning state belongs to the
underlying entities, including direction-specific cards. Copies of authored
entries are a different feature and outside this first path.

Do not infer linguistic kind from the runtime `idiom` family. #10 owns lexical
labels. No corpus-wide classification is needed to teach these four concepts.

## State and persistence proposal

Use a new versioned account-scoped progress record, separate from old boolean
`onboardingCompleted`. Suggested logical fields: version, status (not-started,
active, paused, skipped, completed), stage, acknowledged-action count, optional
Library hint dismissed, last acknowledged action ID. Final storage/API design
is deferred; do not append an arbitrary stale copy of all preferences.

| Situation | Proposed behavior |
| --- | --- |
| Truly new account confirmed by the account/defaults boundary | Offer stage 1 once after the saved training and access are ready |
| Existing account; legacy flag true, false or missing | Do not infer “new” from that flag; no automatic new introduction. Offer manual replay only |
| Unknown account age / eligibility | Be conservative: normal app, optional Help entry. Missing flag is not proof of a new account |
| Skip | Persist skipped, hide immediately, keep ordinary controls and a Help replay entry |
| Exit / reload while active | Pause guidance at last acknowledged milestone; preserve real training session and show a nonblocking Continue introduction affordance |
| Fresh sign-in / another device | Load account state before offering; no automatic restart; reconcile acknowledged action IDs without double-counting |
| Replay | Help/Settings → Introduction; explicit action, no reset of learning, sources, primary training or old flags |
| Write error / offline | Show “Could not save. Try again”; retry idempotently. Do not claim account-wide completion before acknowledgement; do not block ordinary training |
| Empty material | Show existing no-matching-cards recovery; no pretend first card and no completed milestone; allow edit/source choice |
| Inaccessible / revoked source | Explain unavailable material, retry or choose accessible material; retain chosen name and guidance stage; do not expose restricted content |
| Start timeout / session superseded | Existing recovery/authority UI wins; do not overlay it or advance onboarding |
| Save collection fails | Retain name/selection and allow retry; never announce membership based only on optimistic checkbox state |

Eligibility is an explicit implementation dependency, not a timestamp heuristic
chosen by this proposal. The current flag does not encode newness, skip versus
finish, a step, or a resumable tutorial.

## Mobile, keyboard, accessibility and language

Use the existing card and editor controls. On desktop place guidance in normal
flow; on phone put one short line above the current primary action without
covering the bottom controls or competing with the keyboard. 320px width and
200% zoom are acceptance sizes, alongside 390×844 and 1280×900. Respect safe
areas, reduced motion and reading-size preferences. No timer-driven steps.

Give panels a heading and description, announce one milestone in a polite live
region after acknowledgement, and do not announce every render. Inline help
does not trap focus or move it automatically. Modal collection dialogs must
retain their normal focus trap, Escape behavior and focus return. Opening or
closing guidance must not trigger a review shortcut; keyboard hints must match
the current real hotkeys. All actions work by Tab + Enter/Space, with a visible
focus ring. Skip and resume must be reachable without pointer precision.

Use the saved interface language; do not conflate it with Dutch content or a
translation language. [copy.json](copy.json) contains complete draft EN/NL/RU
strings. Check longer Russian labels at 320px. Translation and audio are optional:
definition/example reading and Learn must still work without those providers.

## Validation and acceptance before implementation

Evidence in this change is a current-code local demo audit plus a simulated
concept walkthrough, **not beginner usability evidence**. The prototype stores
only local demonstration state; it does not establish account persistence.
The real-app audit does establish a successful learning action and reload resume.

With owner-approved recruitment (none sent), test 5–6 first-time learners across
EN/NL/RU and phone/desktop. Give outcome tasks without teaching the labels first:
start ready training; explain the shown meaning; learn two cards; find another
meaning; optionally create/use a collection; locate Settings. Ask whether adding
the same meaning to a second collection starts it again. Record time to the first
acknowledged learning action, mistakes, requests for help, skips and recovery.

Proposed decision thresholds, not measured results: at least 4/5 start unaided
within two minutes; at least 4/5 distinguish source, selected meaning and
collection after doing; all can skip and recover; no learner must create a
collection to learn. If collection work dominates time or explanation, keep it
deferred. If two cards already establish the action, do not add a mandatory third.

Engineering gates: #8 saved identity survives reload/fresh sign-in and edits;
old accounts unchanged for all three legacy flag values; successful/failed
start, Learn and review actions; idempotent milestones; skip/resume/replay;
two-device authority; source denied/empty; interrupted write; optional providers
absent; all three languages, keyboard/focus and mobile safe areas. A screen reader
pass remains required; screenshots do not demonstrate accessibility compliance.

## Reviewable slices after acceptance

1. **Independent legacy cleanup:** remove unreachable tour and dependency while
   extracting the live interface-language behavior; preserve stored keys and
   unrelated preferences. Exact file plan and checks in [audit.md](audit.md).
2. **Defaults contract and eligibility integration:** consume #8's persisted
   primary training; prove new/existing account boundaries without editing #8's
   seed or defaults modules here.
3. **Core two-stage guidance:** inline orientation and actual first-card help;
   durable acknowledged progress, skip, pause, replay and error handling. No new
   exercise or builder defaults. Review EN/NL/RU and focus in this slice.
4. **Optional Library help:** contextual meaning/collection explanation, membership
   acknowledgement, training-from-collection invitation and return path.
5. **First-review/editor contextual help + acceptance:** gate by actual capabilities;
   run the authorized beginner evaluation and full persistence/accessibility cases.

Owner decisions requested on this concrete proposal: accept two initial stages;
keep collection creation optional; end guidance after two real actions without
changing saved session size; provide explicit replay in Help/Settings. These
decisions have not yet been approved. No deployment is part of these slices.
