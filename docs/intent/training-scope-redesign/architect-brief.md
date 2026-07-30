# 2000NL Training Scope Redesign Brief

Date: 2026-06-30

## Context

2000NL is a Dutch vocabulary learning application. The core experience is a
training card: the learner sees a Dutch word or expression, reveals the answer,
and reviews it through a spaced-repetition flow.

The project also has dictionary/search/list functionality:

- ready-made dictionary sources, such as VanDale 2k;
- the learner's own dictionary, built from manually added words and phrases;
- personal lists;
- words encountered through connected contexts such as YouTube/video clicks;
- learning and review state managed by the training system.

The current UI has grown through iterations and now mixes several concerns in
one place. The result is technically capable, but it feels confusing and
visually unresolved.

## Private Source Screenshots

The current state was captured in the following local source files:

- `screenshots/01-main-training-screen-current.png`
- `screenshots/02-bottom-training-controls-current.png`
- `screenshots/03-word-search-modal-current.png`
- `screenshots/04-list-management-current.png`

They are intentionally not committed because two contain an account email and
user-created list names. Restricted originals remain under
`/Users/khrustal/archive/2000nl/stale-main-2026-07-30/product-evidence/training-scope-redesign/screenshots/`.

## What Feels Wrong

The main training screen currently exposes filters that do not feel native to
the card experience. A top filter for period/source appears above the card, and
a bottom area also exposes training/list controls. The learner sees multiple
places that seem to answer the same question: what am I training?

Search, list management, dictionary management, and training setup are also too
close together. They are related, but they are not the same user intention.

The current design problem is not only visual polish. The deeper issue is that
the product model is not legible from the interface.

## Desired Product Shape

The main card screen should be calm. It should feel like a training surface, not
a settings console.

On the main screen, the learner should see:

- the current card;
- progress or queue status;
- a small, quiet indicator of the active training mode.

That indicator might say something compact like:

`Dutch · VanDale 2k · New + Review`

or it might be even quieter, closer to a small mode button. The important point:
it should not dominate the training experience.

When the learner wants to change what they are training, they should open a
dedicated training setup surface. This surface may be a drawer, sheet, modal, or
full-screen panel. We have not decided the form yet. It may not need to "slide
out" if a different pattern is more natural.

## What Needs To Be Configured

The learner is not just choosing a list. They are defining a training scope:

> What vocabulary should the training queue draw from right now?

This scope may combine several dimensions.

### Learning Goal

Examples:

- learn new words and review due cards;
- review only, with no new words introduced;
- revisit words recently encountered;
- inspect or practice a specific subset.

### Vocabulary Base

Examples:

- VanDale 2k;
- the learner's own dictionary;
- one or more personal lists;
- a mixed source.

### Learning State

Examples:

- not yet learned;
- already learning;
- due for review;
- encountered but not explicitly added;
- known or completed.

### Content Metadata

Examples:

- nouns;
- verbs;
- expressions;
- idioms;
- frequency bands;
- dictionary-specific metadata.

Some metadata applies to all sources. Some applies only to a specific
dictionary.

### Provenance And History

Examples:

- words clicked today;
- words clicked in the last few days;
- words encountered on YouTube;
- words from a specific video;
- words that appeared in some connected client context.

This is important but should not feel like a random source/time filter bolted
onto the main card.

## Key Entity Distinction

The redesign should make these concepts clearer:

- A dictionary is a vocabulary source.
- A list is a user-owned collection or subset.
- A word/card has learning state.
- A training scope is the temporary or persistent definition of what the
  training queue should use.
- Search is for finding or adding entries.
- Training setup is for deciding what to practice now.
- List/dictionary management is for maintaining sources and collections.

These should connect, but they should not collapse into one universal settings
panel.

## Desired Feeling

The interface should feel:

- quiet on the main card screen;
- powerful when the learner intentionally opens training setup;
- visually consistent across training, search, and list management;
- clear enough that the learner understands what will happen after pressing
  start;
- flexible enough for deep filtering without making every session feel like
  configuring a database query.

The current rough concepts explored so far do not yet achieve this. They are too
literal, too simple in the wrong places, and not visually compelling. The next
design round should step back and find a stronger interaction metaphor and
visual hierarchy.

## Open Design Questions

1. What is the right mental model for "what am I training now"?
2. Should training setup be a drawer, modal, full-screen workspace, command
   palette, or something else?
3. How should quick mode switching differ from deep filtering?
4. How should search/add-word flows connect to training without becoming part of
   the training setup UI?
5. How should personal lists coexist with dictionaries without confusing the
   learner?
6. How can provenance filters such as YouTube/video/date feel natural rather
   than bolted on?
7. What should the main card screen show when a complex scope is active?
8. Should training scopes be saveable as named presets or lists, and when?

## What We Want From An External Architect

We want a critique of the information architecture and interaction model before
implementing another UI iteration.

Useful feedback would include:

- whether the entity model is understandable;
- which concepts should be merged or separated;
- what the primary training setup pattern should be;
- what should never appear on the main training card screen;
- how to structure quick filters versus advanced filters;
- whether lists are adding useful flexibility or unnecessary complexity;
- how to make the experience feel elegant rather than merely functional.
