# Dutch filter scheme v1

Proposed product contract, 2026-09-26; not an implemented runtime schema. Machine-readable companion: [dutch-training-filter-schema-v1.json](dutch-training-filter-schema-v1.json).

## Evidence correction

The subsequent parser investigation supplied by the user establishes populated POS on 18,141/18,163 entries and source evidence for all 8,651 article-derived and 3,744 conjugation-link-derived classifications. `known` is not an accuracy boundary. The earlier product review's general POS validation gate is superseded: use these normalized classifications. Five demonstrated misclassified meanings are addressed by PR #515; the supplied status says merge/import are pending. Weak rules and 22 empty entries remain targeted follow-ups. These findings were supplied by the user, not independently rerun in this review.

## Initial tree

Exercise types are separate from lexical filters: Words (ordinary dictionary meaning cards), Idioms, Translation. Translation is sentence-context practice of the target word, not a separate per-example-sentence grading mode. Do not render the unimplemented Example sentences option, even disabled. Retain any historical discussion outside current product screens.

- Part of speech: Nouns, Verbs, Adjectives, Adverbs, Pronouns, Prepositions, Conjunctions, Numerals, Articles, Interjections. Empty means any, including unclassified/other source categories. Abbreviations and prefixes are not initial visible options; selecting all visible POS therefore does not normalize to empty.
  - Nouns: Article — de / het.
  - Verbs: Perfect auxiliary — hebben / zijn, enabled only after validated normalization. Until then Verbs remains selectable without a disclosure arrow.
  - Other POS: no invented child fields or empty disclosure panels.
- Content relation filters are deferred and not rendered. Synonym/antonym data is reserved for automatic eligibility of future dedicated exercises; no practical current learner-facing selection is required.

Examples, idioms, audio, plural forms and comparative forms are not initial visible filters. Use exercise eligibility automatically when an exercise needs particular material. Later exposure must have a clear learner use case. Regularity, separability, reflexivity, fixed prepositions, CEFR and topics require a separately validated capability and are absent from release UI.

## Selection and state

Source AND exercise eligibility AND global content constraints AND (selected POS branches).

Inside each branch, parent POS AND child constraints. Values within one child are OR. Empty POS selection omits the whole POS predicate; orphan children are invalid.

- Selecting Nouns and Verbs, de, hebben, Has synonyms means: source AND eligible AND synonyms AND ((noun AND exact de) OR (verb AND recorded auxiliary includes hebben)). It does not apply the article to verbs.
- For Article, one selection restricts to the exact article and excludes missing/mixed data. Selecting both resets this field to unrestricted, visibly clearing its selected buttons and badge. It deliberately includes missing/mixed again.
- For Auxiliary, proposed membership semantics mean a both-recorded entry matches either hebben or zijn. Both selected resets to unrestricted, including missing data. The audit's only-hebben/only-zijn counts cannot be used as counts for this proposed membership predicate; recalculate them with exercise eligibility. A separate 'both recorded only' option is deferred.
- Removing Nouns clears Article. Removing Verbs clears Auxiliary. Parent reset and child reset are atomic before requesting a new count.
- Opening an unselected parent's disclosure also selects that parent. Closing or switching editors does not clear filters. One shared child panel is open at a time; top-level builder sections may remain open together.
- Nouns · 1 means one constrained child field. Two selected values in one future non-exhaustive child still count as one. Do not render a badge for an unconstrained parent.
- No arbitrary AND/OR builder. Valid combinations may produce zero results; preserve them and offer clearing constraints. Do not disable valid options merely because they currently have zero matches.
- Unsupported fields are hidden. A saved preset containing an unavailable constraint must show a repair state, not silently broaden the training pool. Source/language changes likewise require explicit handling of incompatible saved constraints.

## Rendering

Parent body toggles selection, disclosure segment toggles editing; actions do not cascade accidentally. Selected-parent styling, expanded-segment styling and child count are distinct state signals. Chevron only when a supported child exists. Preserve accepted purple disclosure treatment and avoid physical chip-panel bridges. Desktop property row: label left, choices right. Mobile: label above wrapping choices, full-width panel below POS choices. Accessible names and expanded/selected states accompany visual signals.

Content uses separate labelled toggles so two enabled properties read as two independent requirements, not an OR choice group. Auxiliary group gets a short contextual explanation only if needed: 'Includes verbs with both auxiliaries.' No repeated builder instructions.

Count unique eligible meanings, automatically, with a small animated pending state. Ignore stale responses; count errors remain distinct from zero and have retry. Zero disables Start while leaving filters editable. Direct + Reverse never doubles this meaning count. Session size is a different unit: requested exercise presentations.

## Implementation acceptance examples

1. No lexical filters: all eligible meanings in the source, including unknown POS.
2. Nouns + de: exact-de eligible noun meanings only; Nouns · 1.
3. Add het: Article clears to unrestricted; noun badge disappears.
4. Nouns + de + Verbs: all eligible verbs plus exact-de eligible nouns.
5. Remove Nouns: Article clears; Verbs remains selected.
6. Both content toggles on: each result has both recorded relations on the same meaning.
7. Auxiliary capability absent: no auxiliary control or Verb chevron; POS selection still works.
8. Auxiliary available, hebben selected: include both-recorded entries, exclude missing.
9. Direct and Reverse selected: same available-meaning count as one direction when eligibility is otherwise unchanged.
10. Switch child editor or collapse section: selections and counts persist.
11. Empty result and calculation failure render as distinct states.
12. A saved unsupported constraint cannot silently disappear during preset loading.

## Latest user review — supersedes earlier rendering examples

Remove all Has synonyms/Has antonyms controls and summary chips from current UI. Earlier logical examples involving these fields describe deferred capabilities only. Expanded section headings retain the same live selection summary as collapsed headings. Desktop Article choices sit near the label. Mobile noun subfilters use a focused anchored popover: parent chip remains clear, background dims/blurs slightly; same-chevron/outside/Escape closes without clearing. Mobile Direct/Reverse previews sit side by side, prompt semibold, answer quieter, header separated by a fine rule; selected uses subtle lilac surface and filled accent check, unselected neutral surface and empty circle. White mobile editor over the page versus pale desktop editor within the white panel is an accepted responsive surface treatment.
