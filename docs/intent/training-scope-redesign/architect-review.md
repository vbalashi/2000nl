# 2000NL Training Scope — Architect Review

Date: 2026-06-30
Reviewer role: external information-architecture / interaction critique
Reviewer identity/tool: unknown; not recorded in the recovered source
Inputs: `architect-brief.md`, screenshots 01–04, concept board `DFQzL` (A/B/C/D + notes)

---

## 0. Verdict in one paragraph

The product model is sound; the **interface flattens it**. Today the card
screen answers "what am I training?" in three competing places, and one modal
answers four unrelated questions. The fix is not a better filter panel — it is
a clean two-layer model (a **Pool** of words + a **Plan** for studying them),
surfaced through **two interaction speeds** (a one-tap preset switch for the 90%
case, a focused panel for the rare deep case). Your four concepts are all
versions of the deep panel. None of them solve the fast case, which is the one
that actually keeps the card screen calm. Concept **D is the right instinct for
the deep surface but too heavy**; it needs to lead with language and a number,
not with a dashboard.

---

## 1. The core diagnosis: one question, many answers

The brief is right that this is not a polish problem. The legibility problem has
a precise shape:

**The card screen answers "what am I training?" four times.**
On screen 01 alone the learner sees:
1. a top **Periode / Bron** filter pair,
2. a **"Huidige training: Nederlands · VanDale 2k · Begrip · Nieuw + herhaling"** summary line,
3. four editable **chips** (Dutch / VanDale 2k / Begrip / Nieuw + Herhaling),
4. a **Wijzigen** button.

Plus a **Recent / Details** search panel docked to the card. Five things, four
of which are scope controls and one of which is a different feature entirely
(search). When five elements claim the same job, none of them reads as the
source of truth.

**One modal answers four questions.**
The Woorden-en-lijsten modal (03, 04) carries tabs *Zoeken / Lijsten /
Statistieken / Instellingen*, and inside list management it *also* exposes
*Trainingsinstellingen* and *Actief voor training*. So: search, list curation,
statistics, app settings, **and** training setup all collapse into one surface.
The same dictionary (VanDale 2k) appears simultaneously as a "training source,"
a "training list," and a curated dictionary. The surfaces leak into each other.

This is the whole problem stated structurally: **surfaces are not 1:1 with
intentions.** Some intentions are answered in many places; some places answer
many intentions. Everything else downstream (visual noise, the "settings
console" feeling, provenance feeling bolted on) is a symptom of this.

---

## 2. The entity model — mostly right, two muddy seams

Your entity list is good and worth keeping:

- **Dictionary** = a curated vocabulary source (system-owned).
- **List** = a user-owned set of words.
- **Word/card** = an item with learning state.
- **Training scope** = the definition of what the queue draws from.
- **Search** = finding/adding entries.
- **Training setup** = deciding what to practice now.
- **Management** = maintaining sources and collections.

Two seams are muddy, and they cause most of the confusion.

### Seam A — "Goal" and "Learning State" are the same axis at two zoom levels

The brief lists five co-equal scope dimensions: Goal, Base, State, Content,
Provenance. **Co-equal is the bug.** Two of them collide:

- Goal = "review only" *is* State = "due."
- Goal = "learn new + review" *is* State ∈ {new, due} + a new-card cap.

If you expose Goal **and** raw State as independent controls, you manufacture
contradictory states (Goal "review only" while the State checkbox still includes
"new"). The current chips already hint at this — *Begrip* and *Nieuw + herhaling*
sit side by side as if independent, but they constrain each other.

**Recommendation:** treat **learning state as an output of the scheduler, not an
input the user dials.** The learner expresses a *Goal*; the system selects the
matching cards. Raw state checkboxes appear only in an "inspect/browse a
specific subset" power-mode. This single change removes a whole row of controls
from the common path and eliminates the contradiction.

### Seam B — at training time, a List and a Dictionary are the same primitive

A dictionary and a list answer the identical question for the queue: *"draw
words from this named set."* Their differences (curated vs user-owned, read-only
vs editable, large vs small, rich metadata vs inherited) matter in **management**,
not in **training setup**.

**Recommendation:** at the training-setup surface, unify them under one concept —
**Source** — with grouped options (*Dictionaries* / *My lists* / *Encountered*).
The dictionary-vs-list distinction belongs in the Library, where you maintain
them. Don't make the learner hold "is this a dictionary or a list?" in their head
while choosing what to practice.

### The model that makes it legible: **Pool + Plan**

Collapse the five flat dimensions into two layers:

```
SCOPE  =  POOL  +  PLAN

POOL  (a set — "which words even exist for this session?")
  • Source(s): dictionary | my dictionary | list | encountered/activity
  • Content metadata: part of speech, expression/idiom, frequency band,
                      dictionary-specific tags
  • (Provenance lives here — it is a *kind of source*, see §5)

PLAN  (a policy — "how do I want to study that pool right now?")
  • Goal: new + review | review only | revisit recently seen | browse/inspect
  • Caps: how many new, how many reviews
  • (Learning-state selection is derived from Goal, exposed raw only in "browse")
```

Why this is the highest-value move: "where am I drawing words from" and "how do I
want to study them" are genuinely different questions, and humans hold them
separately. Five flat facets read as a database query. **Two layers read as a
sentence:** *"**Review** words from **VanDale 2k**."* The sentence is the mental
model (answering open question 1). A saved sentence is a **preset** (see §6).

---

## 3. The interaction model — you drew the workbench, not the light switch

The most important critique of the board: **A, B, C, and D are four versions of
the same thing — a deep configuration surface.** Not one of them addresses the
case that actually dominates real use and actually threatens the calm card
screen:

> "I just want to flip from *new + review* to *review only* and keep going."

That is a **light switch**, not a workbench. It should cost one tap and never
take over the screen. Because the board has no light switch, all the pressure
falls on the card screen, and the card screen grows chips and dropdowns to
provide fast switching inline — which is exactly the noise you're trying to
remove. **Build the light switch and the card screen gets quiet for free.**

So the answer to open question 3 (quick vs deep) is an architecture, not a
toggle:

### Two speeds, layered

**Speed 1 — Quick switch (the light switch): a preset popover.**
The card screen shows exactly one scope control: the **mode indicator**, a button
rendering the current scope as a sentence (`Review · VanDale 2k · 42`). Tapping
it opens a small **popover**, not a drawer:
- 3–5 **presets** ("New + Review", "Review only", "Today's clicks", "From YouTube"),
- the active one checked,
- a single **"Customize…"** row at the bottom.

The unit of quick-switching is a **whole named scope**, never an individual
filter atom. Most sessions begin and end here.

**Speed 2 — Deep build (the workbench): the focused scope panel.**
"Customize…" opens the real surface — your **Concept D, refined** — as a centered
modal/sheet on desktop, full-screen on mobile. This is where Pool + Plan get
composed, with a live result. It is intentional, rare, and allowed to be
powerful.

This directly answers open question 2: **not drawer vs modal vs palette — it's
popover *then* modal.** A command palette (B's instinct, and the brief's
mention) is wrong as the *primary* because it is invisible and unguessable and
fights the "calm, legible" goal; but its **chip-summary of the active scope** is
worth stealing as a *display* element inside the panel.

---

## 4. Honest read of A / B / C / D

Your own notes are correct; here is the why, and what to harvest from each.

- **A · Guided drawer.** The step rail (Goal → Source → Status → Content →
  History → Result) is too linear and makes a 2-second change feel like a wizard.
  *Keep:* "pick intent first, the rest adapts." *Drop:* the six-step rail and the
  one-screen-per-step pacing.

- **B · Faceted command sheet.** Reads as an admin filter console — four equal
  facet columns give every dimension equal weight, which re-creates the flat
  five-dimension problem in a prettier box. *Keep:* the **scope-as-chips**
  summary and the sticky result bar. *Drop:* four co-equal columns as the
  primary layout.

- **C · Queue builder with preview.** The live preview is the best idea on the
  board. But numbered "Start from → Include → Narrow → Narrow" blocks make *every*
  session feel like constructing a query — exactly the feeling to avoid. *Keep:*
  the **live preview with count + sample rows.** *Drop:* the explicit
  query-builder framing.

- **D · Focused scope panel (your pick).** Right information architecture: intent
  → base → adaptive refinements → live result with "why these cards." This is the
  one to build. **But it is visually too heavy:** a giant dark result slab (the
  62px "42", queue mix, "why," sample, actions) competing with a dense left
  column re-introduces the dashboard/console feeling one level down. *Fix:*
  - lead with the **sentence and the number**, demote the mechanism;
  - **collapse refinements** (status/content/history) behind one "Refine" expander —
    open the panel at *intent + base + result* only;
  - make the result a **quiet persistent footer** (`42 cards · no new words`), not
    a slab; put "why these cards" and the sample **behind a tap**, not always-on.

The elegant version of D barely looks like a filter UI. It looks like you are
**completing a short instruction and watching a number respond.** That is the
difference between "functional" and "elegant" the brief is reaching for: lead
with language and outcome, hide the toggles.

---

## 5. Provenance (YouTube / video / date) — stop treating it as a filter

It feels bolted on because it currently sits in a **top-bar "Periode" dropdown,
at the same altitude as the card** — implying it's a primary, always-relevant
training axis. It isn't.

**Reframe: provenance is a *source*, a sibling of "VanDale 2k," not a sibling of
"Goal."** "Words I clicked today," "From YouTube," "From this video" are
*dynamic, auto-generated sources*. Put them in the Source picker as a third group:

```
Source
  Dictionaries    VanDale 2k · …
  My lists        Exam vocabulary · Travel basics · …
  Encountered     Today's clicks · Last 3 days · YouTube · This video…
```

Now provenance is native: it's chosen in the exact place you choose any source,
it composes with a Goal the same way ("**review** words **from this video**"),
and it vanishes from the card screen entirely. It is a Pool input, full stop.
(Answers open question 6.)

---

## 6. Lists — useful, but currently doing three jobs

Lists *are* worth keeping; they're how a learner says "these specific words
matter to me." But today the concept is overloaded. In screen 04, VanDale 2k
appears as a "Training" source, a "Trainingslijst," **and** a curated dictionary;
"Mijn lijsten" sit beside all of it. The learner can't tell what a "list" is.

Separate the three jobs cleanly:

1. **List** = a user-owned *set of words* (membership you edit). Lives in Library.
2. **Source** = anything you can train from (dictionary **or** list **or**
   encountered set). A training-time concept; lists are one kind of source.
3. **Preset / saved scope** = a saved *configuration* (Pool + Plan). **This is not
   a list.** A preset can *reference* a list as its base, but it stores intent +
   filters, not words.

This resolves open question 8: **scopes are saveable — as presets, not as
lists.** Offer "Save this setup" only after the learner has built a non-trivial
scope in the panel, and be explicit that it creates a reusable mode (it then
shows up in the Speed-1 popover). "Save these specific words" is the *only* action
that creates a list. Keep the two verbs distinct and the confusion dissolves.

---

## 7. Surface map — what each screen is, and the one hinge

```
TRAIN  (the card screen)            LIBRARY  (the management world)
  • the card (dominant)               • Search / add words
  • reveal + grade                    • My dictionary
  • session progress (quiet)          • Lists (curate membership)
  • ONE mode indicator  ─────┐        • Stats, settings
                             │
            Scope panel  ◀───┘        Hinge: every list/dictionary/word-set
            (modal over Train)        has a "Train this" action that opens
                                      Train with that scope preloaded.
```

- **Training setup is a modal over Train, not a nav destination.**
- **Search is a Library activity, never docked to the card.** It connects to
  training through exactly one hinge — *"Train this"* from a list/word in Library,
  and *"Look this up"* from a card into Library. They share components, not
  surfaces. (Answers open question 4.)

### Never on the card screen
- Period / Source / Base dropdowns (the current top filters).
- The four editable scope chips *as controls*.
- The search box and Recent/Details search-history panel.
- List management, stats, settings — anything labeled "Instellingen."
- Any second thing that answers "what am I training?"

### Always on the card screen
- The card, dominant and calm.
- Reveal + grade actions.
- **Session** progress (this queue), not global corpus counts that read as filters.
- Exactly **one** mode indicator = the single source of truth, and the only door
  to changing scope.

> **Single-source-of-truth rule:** there is exactly one element on the card
> screen that states the scope, it is a button (not a panel), and tapping it is
> the only path to change scope. Every other current answer to that question is
> removed, not relocated.

### When a complex scope is active (open question 7)
Don't render the query on the card. Render the **sentence + count, truncated**:
`Review · YouTube · 42 cards  (+2)`. The "+2" hints at extra filters; the full
scope is legible as chips only inside the panel. The indicator summarizes intent;
it never reproduces the filter set.

---

## 8. Quick vs advanced filters — the structural rule

- **Quick (popover):** pick a *destination* — a whole named scope (preset).
  Goal presets + your top few sources. No individual filter atoms here.
- **Advanced (panel):** adjust the *route* — Pool/Plan dimensions, with everything
  past intent+base collapsed under "Refine."

Rule of thumb: **quick = choose where you're going; advanced = adjust how you get
there.** Never leak filter atoms onto the fast path.

---

## 9. Why it will feel consistent (not just tidy)

The three surfaces feel like different apps today because each was designed as its
own world: Train = filters-on-top, Search = tabbed modal, Lists = three-pane
admin. Unify at the component level, not just the visual level:

- One **Source** component, reused in the scope panel's base picker *and* the
  Library list rail.
- One **word-row** component everywhere a word is listed (search results,
  list contents, queue preview).
- One **scope-chip** component for rendering a scope as a sentence — on the
  indicator, in the popover, in the panel.

One component library, three contexts. Consistency then comes from shared parts,
which survives future iteration better than shared styling.

---

## 10. What to prototype next (before more pixels)

1. **The mode indicator + preset popover** (Speed 1). This is the highest-leverage,
   lowest-effort piece and it's entirely missing from the board. Prove the calm
   card screen here first.
2. **Refined D** (Speed 2): open at *intent + base + quiet result footer*, with
   "Refine" collapsed and "why these cards" on demand.
3. **The Source picker with three groups** (dictionaries / lists / encountered) —
   this is what makes provenance native and unifies lists with dictionaries.
4. Defer: presets/saving, stats, the full Library redesign. They're downstream of
   getting the two speeds and the Pool/Plan split right.

---

## Appendix — direct answers to the eight open questions

1. **Mental model for "what am I training now?"** A sentence: *Goal* + *Source*
   (+ optional refinements). Backed by a two-layer model: **Pool** (which words)
   + **Plan** (how to study them).
2. **Drawer / modal / full-screen / palette?** Both, layered: a **popover** of
   presets for quick switching, opening a **focused modal panel** (refined D) for
   deep building. Not a command palette as primary.
3. **Quick vs deep?** Quick = pick a whole named scope in a popover. Deep = compose
   Pool+Plan in the panel. The unit of quick-switching is a scope, not a filter.
4. **Search ↔ training?** Separate surfaces (Library vs Train). One hinge:
   "Train this" from Library opens Train preloaded; "Look this up" from a card
   opens Library. Search never docks to the card.
5. **Lists vs dictionaries?** At training time they're one primitive: a **Source**.
   The distinction lives in Library/management, not in training setup.
6. **Provenance natural, not bolted on?** Make it a **source type** in the Source
   picker (Encountered group), never a top-bar period filter.
7. **Card screen with a complex scope?** Sentence + count, truncated, with "+N".
   Full scope legible only inside the panel.
8. **Saveable scopes?** Yes — as **presets** (saved Pool+Plan), explicitly *not*
   as lists. Offer "Save this setup" after a non-trivial scope is built; saved
   presets become Speed-1 popover entries.
