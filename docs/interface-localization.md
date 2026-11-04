# Interface localization

The learner interface has one English source catalog and one matching catalog per
interface language in `apps/ui/locales/`. Catalogs include navigation, settings,
training, library and sharing, sign-in, onboarding tours and app-level notices.
The existing English, Russian and Dutch catalogs were consolidated without
changing saved preference identifiers.

## Three independent language choices

- **Interface language** selects UI messages, plural rules, number formatting and
  document direction. Its registry is `locales/registry.json`.
- **Learning language** belongs to the dictionary/material and training selection.
- **Translation languages** belong to dictionary explanations and examples.

Enabling an English dictionary does not change a user's interface language or
make all UI languages available for dictionary translation. Changing the interface
does not change the active training selection. A saved account interface choice
wins over the browser's saved choice; otherwise browser language preferences are
used, then English. Dictionary translation preferences are not a detection input.
The legacy storage key `onboarding_language` and account preference
`onboardingLanguage` are retained for compatibility.

## Where to edit text

`en.json` is the source. Keep stable semantic keys, even when changing wording.
`ui` contains the main screens; `features` contains named sections migrated from
component-local copy; `tour` contains the live guided tour. Existing dictionary
card label namespaces also remain in the same files. These files contain UI copy,
not full dictionary content, private prompts, or learner data.

Use `getInterfaceCatalog(language)` / `getUiMessages(language)` for messages.
`localizedSection(section)` and `localizedField(section, field)` let existing
adapters keep their language-indexed interface while reading the same catalogs.
Do not introduce inline language maps or language-comparison ternaries for copy.
Parameter values use named placeholders such as `{count}` and `{word}`; use
`formatMessage` rather than concatenating fragments of translated sentences.

Count messages have all six CLDR forms: Zero, One, Two, Few, Many, Other.
Existing languages have explicit fallback wording in unused forms. New languages
must supply appropriate wording for their own categories. `formatUiCount` and
`formatPluralMessage` use the interface locale, not the dictionary language.

## Changing an existing message

Run these commands from `apps/ui`:

1. Edit the English source text and the corresponding translations.
2. Run `npm run i18n:report` (or add `-- --json` for a structured worklist).
3. Review the changed translations against the new source and their screen context.
4. Record each completed item explicitly:
   `npm run i18n:review -- --locale ru --key ui.navigation.training`.
   Repeat `--key` for multiple messages.
5. Run `npm run i18n:check` and the relevant UI tests.

The report distinguishes missing, blank and extra keys, wrong placeholders or
shapes, unreviewed messages, outdated source text and translations edited since
acknowledgement. For an outdated message the JSON report includes the previous
English source, the new source and the current translation.

`locales/reviews/<language>.json` records the English source and a fingerprint of
the translation at acknowledgement. An English edit invalidates the matching
translations even if the key remains unchanged. A translation edit also needs
acknowledgement. Updating generated imports never resets this state. Keep review
files in version control; they are tooling metadata and are not bundled at runtime.
The initial snapshots accept the pre-existing translations as the migration
baseline; they do not certify a new human language review.

Use `--all` only after deliberately reviewing the entire language catalog. Never
run it automatically to make a failing check pass. Removing an English key also
requires removing it from the target catalogs; obsolete review entries are pruned
by a deliberate whole-catalog acknowledgement.

## Preparing and enabling a new language

1. `npm run i18n:prepare -- --locale uk` creates a draft catalog using English text
   and an empty review file. It refuses to overwrite an existing catalog.
2. Translate it with the screen context and terminology in mind. English text in
   the draft is source material, not a completed translation.
3. `npm run i18n:report -- --locale uk --json` lists outstanding work.
4. After language review, acknowledge completed keys, or explicitly use
   `npm run i18n:review -- --locale uk --all` for a fully reviewed catalog.
5. `node scripts/interface-localization.mjs check --locale uk` must pass.
6. Add `"uk": {"name": "Українська", "direction": "ltr"}` to
   `locales/registry.json`. This is the only hand-edited registration point.
7. Run `npm run i18n:sync` to regenerate static imports, then
   `npm run i18n:check`, `npm run typecheck` and relevant tests.
8. Check important screens at phone and desktop widths before releasing.

Draft catalogs are not imported or shown in selectors until registered. Registered
catalogs must match the English shape; the application does not silently replace
missing translations with English. CI checks all registered languages.

For Arabic and Persian use `direction: "rtl"`. The registry and document effect
support direction metadata, and plural helpers support Arabic's six categories.
This groundwork does not certify full RTL layout support: mixed-direction
learning content, arrows, alignment, dialogs and fonts still need browser QA
before either language is enabled. Tigrinya also needs font coverage checks.

## Guardrails and scope

`npm run i18n:check` validates all registered catalogs, review state and generated
imports, then scans learner components for inline JSX text and local language
maps. `npm run i18n:audit` runs that source scan alone. It is a heuristic, not a
proof that every dynamically constructed string is localized. Review new visible
strings in JavaScript expressions as well as labels and accessibility text.

Operator/admin tools, development diagnostics and the standalone development
onboarding preview's demonstration text are outside the learner translation
catalog. Brand marks, language autonyms, dictionary examples and grammatical data
are not automatically UI translations. In particular, `badgeTooltips.ts` is
selected by the dictionary translation language, and `directionExamples.ts`
contains learning examples; neither defines available interface languages.
Release announcements and user-authored names are content rather than reusable
interface messages.

CI also runs `npm run i18n:check-registration`: TypeScript compiles against an
additional in-memory locale to detect fixed-language maps that ordinary checks
would miss. This probe writes no files and does not enable a real language.
