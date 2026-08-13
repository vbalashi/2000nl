# 2000NL Context

This context defines product-specific language for 2000NL learning, platform,
and external integration work.

## Language

**Connected Client**:
A registered external application that a 2000NL user can grant access to through 2000NL Connect.
_Avoid_: extension, companion app, OAuth app, third-party app

**Connected Client Session**:
A 2000NL-issued session for a specific user and Connected Client, represented to the client by an access token, refresh token, expiry, and user summary.
_Avoid_: extension session, Supabase session, app token

**Connected Client Grant**:
A user's permission for a Connected Client to use selected 2000NL access scopes on that user's behalf.
_Avoid_: consent, authorization, permission record

**Connected Client Scope**:
A named access boundary that can be granted to a Connected Client, such as reading platform data, updating learning progress, or staying connected offline.
_Avoid_: role, entitlement, feature flag

**2000NL Connect**:
The authorization flow where a 2000NL user grants a Connected Client access and receives a Connected Client Session.
_Avoid_: extension login, OAuth, Supabase login

**Canonical Learning Source**:
The stable technical identity of content that produced a learning action, such as a YouTube video id and derived canonical URL.
_Avoid_: video title, page title, user-visible source label

**User-Observed Source Label**:
The source label a specific user saw when they performed a learning action, such as the YouTube video title shown at that moment.
_Avoid_: canonical source title, global source metadata

**Headword Group**:
A Platform-owned presentation and search grouping of Dictionary Entries that belong to one source article or an explicitly owned user/generated group. The Platform exposes an opaque `headwordGroupId`; clients must not reconstruct the group from visible spelling, part of speech, source labels, or result order. Separate homographs and entries from different dictionaries remain separate groups even when their displayed headword is identical. Initially, each user-owned entry receives its own private durable group on create/copy/save; edits and renames preserve that group, and combining user meanings requires a future explicit regroup action. A group can contain multiple meanings and parts of speech, but is not itself a learning-action target.
_Avoid_: card, entry, meaning

**Dictionary Meaning**:
One learnable sense or usage of a headword, including its definition when present and its related usage pattern, examples, idioms, and notes.
_Avoid_: headword, whole dictionary article

**Dictionary Entry**:
A durable meaning-level record in one dictionary. Its entry ID is the identity used by lists, translations, user notes, and learning state.
_Avoid_: headword group, whole dictionary article

**SenseCard**:
The learner-facing projection of one Dictionary Entry for one card type, enriched with the current user's state and permitted actions.
_Avoid_: headword group, multi-meaning article

**Known Mark**:
A reversible user decision that one exact SenseCard does not need training. It is durable current state layered over, rather than encoded as, an FSRS review result. Marking known excludes the card without rewriting its prior scheduling state; `undo-known` atomically clears the current mark and restores that preserved state. The action history remains auditable.
_Avoid_: Easy review, hidden card, deleting prior state

**Content Node**:
A durable, Platform-issued semantic element inside one Dictionary Entry, such as a definition, Usage Pattern, example, idiom, or note. Its opaque `contentNodeId` survives harmless source reordering. Translation freshness is checked separately through the node's source-text fingerprint; a diagnostic source path is never identity. New or ambiguous source elements receive new IDs instead of being matched by array position.
_Avoid_: section index, source path, visible text as identity

**Sense-aware Translation**:
A target-language rendering chosen from the full context of one exact Dictionary Meaning, including its definition, Usage Pattern, examples, idioms, and notes, rather than from headword spelling or part of speech alone.
_Avoid_: headword translation, POS-disambiguated translation

**Translation Artifact**:
A reusable target-language rendering bound to one exact Dictionary Meaning or Content Node and kept distinct from source dictionary content.
_Avoid_: translated dictionary entry, UI translation string, source data

**Alternative Translation**:
A model-generated additional target-language rendering of the same exact Dictionary Meaning. It belongs only to the Translation Artifact, never to source dictionary content; the absence of a useful alternative is represented by an empty list.
_Avoid_: source synonym, punctuation-delimited translation, required filler

**Base Translation**:
An optional context-free rendering of a headword stored alongside, but distinct from, the primary Sense-aware Translation.
_Avoid_: literal fragment translation, primary translation, source gloss

**Usage Pattern**:
A schematic construction or valency pattern that shows how a Dictionary Meaning is used, such as `iemand of iets ligt iemand`. It is not a natural-language example sentence.
_Avoid_: example, usage note, definition

**Usage Note**:
Explicit editorial guidance about register, region, restriction, or usage. It must come from source semantics and must not be inferred from a Usage Pattern or example.
_Avoid_: context, pattern, example

**Lexical Relation**:
A typed meaning-level relationship to another expression, such as a synonym, antonym, or cross-reference. It is structured dictionary content and must not be recovered by parsing punctuation from a definition.
_Avoid_: definition suffix, example, untyped related text

**Word Form**:
An inflected, conjugated, declined, comparative, plural, diminutive, or alternate form associated with a Dictionary Entry. A Word Form can support lookup or word details but is not a separate Dictionary Meaning by default.
_Avoid_: meaning, headword group, card

**Cross-reference Entry**:
A dictionary lookup record that redirects to another headword or meaning and has no independent learnable meaning content.
_Avoid_: empty SenseCard, synonym

**Feedback Item**:
A durable, reviewable learner report about one classified product or content problem. It retains the stable target, category, whether a learner comment was supplied, an optional admin-authored sanitized summary, review status, and any manually linked follow-up after temporary diagnostics expire; raw learner prose expires with its Diagnostic Envelope.
_Avoid_: diagnostic dump, GitHub issue, support ticket

**Diagnostic Report**:
One intentional learner submission that combines a Feedback Item with bounded evidence about the current 2000NL operation. A retry of its delivery is still the same Diagnostic Report; a later Report action is a new one.
_Avoid_: telemetry event, log bundle, crash dump

**Diagnostic Envelope**:
The temporary, size-bounded evidence attached to a Diagnostic Report for internal review. It contains the bounded learner comment, exact authorized current-card projection, and allowlisted 2000NL observations; it is not the durable Feedback Item or a GitHub issue body.
_Avoid_: browser snapshot, raw request, console log
