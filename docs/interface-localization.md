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

## Adding a new message

The existing AI translation note uses `ui.settings.translationAttribution`.
For an additional explanation under the translation-language setting, use the existing
mechanism; no new language switch or per-screen translation system is needed.
Run this from `apps/ui`:

```sh
npm run i18n:add -- --key ui.settings.translationDetails --text "Learn more about AI translations."
```

The command adds the English source and scaffolds the same key in every active
and prepared draft locale. Target entries initially contain English source text
and remain **unreviewed**. Nothing is automatically translated or approved.
Existing keys and invalid parent paths are rejected before any catalog is changed.

Translate the RU/NL entries (and future enabled languages), then acknowledge each:

```sh
npm run i18n:review -- --locale ru --key ui.settings.translationDetails
npm run i18n:review -- --locale nl --key ui.settings.translationDetails
npm run i18n:check
```

In the language settings component, where `copy` already comes from
`getUiMessages(interfaceLanguage).settings`, render `{copy.translationDetails}`
in the explanatory paragraph. Adding a catalog key alone does not create a new
control or place text on the screen. Conversely, adding the sentence directly to
JSX, a local variable or a tooltip is rejected by the source audit. Editing the
English wording later makes the corresponding target translations outdated.
The integration tests exercise adding an AI note in temporary fixture catalogs.
The product’s existing AI note is also read from the central catalog.

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
acknowledgement. Updating generated imports and install metadata never resets this state. Keep review
files in version control; they are tooling metadata and are not bundled at runtime.
The initial snapshots accept the pre-existing translations as the migration
baseline; they do not certify a new human language review.

Use `--all` only after deliberately reviewing the entire language catalog. Never
run it automatically to make a failing check pass. Removing an English key also
requires removing it from the target catalogs; obsolete review entries are pruned
by a deliberate whole-catalog acknowledgement.

## Catalog delivery without an application release

The app includes a bundled fallback, but the deployed interface is read from a
versioned, operator-owned snapshot when `INTERFACE_CATALOG_DIR` is configured.
After the initial deployment of this mechanism, publishing compatible wording or
an additional language needs no rebuild, container restart or app-version change.
A normal page reload adopts the published revision. An already open document pins
its revision: publication never remounts an active card, clears a draft, or changes
a running training selection. Changing the selected interface language still works
immediately among the languages available to that document.

`lib/i18n` owns validation, server delivery, startup and compatibility adapters.
Existing components continue to use the same typed message keys. Locale IDs are
runtime values validated against the active registry, rather than a fixed union
of the languages bundled at build time. Module-level adapters and onboarding tours
resolve through the active snapshot instead of freezing the original translations.

### Publishing or adding a language

Keep one source catalog and its matching translations/review snapshots. A separate
catalog checkout may contain data changes without changing the application image:

1. Edit existing wording, or prepare/translate a complete new language. Add its
   autonym, direction and optional formatting locale to that checkout's registry.
2. Review translations against English. `i18n:review` also accepts `--catalog-dir`;
   source wording edits require renewed acknowledgement of affected translations.
3. Publish from `apps/ui`:

   ```sh
   npm run i18n:publish -- --catalog-dir /path/to/catalog-checkout --out-dir /path/to/catalog-volume
   ```

   Use `--expect-contract CONTRACT` with the target app’s reported contract to fail
   early if the source checkout needs different application code. Publication runs
   the catalog/review checks and validates the complete snapshot.
   It creates an immutable `<contract>.<revision>.json` archive and atomically
   replaces `<contract>.json`. It does not edit application code or build assets.
4. Mount that **directory** read-only into every UI replica and set
   `INTERFACE_CATALOG_DIR` to its in-container path. Do not bind-mount only the
   active file: replacement can leave a container reading an old inode. Initial
   mount/environment provisioning requires the normal deployment workflow; later
   publications do not. Replicas must receive the same active file.
5. Verify `/api/interface-catalog` reports the published contract/revision on the
   target deployment. The server rechecks the file at most every five seconds.
   Reload the app to see the new text or language.

For a catalog-only checkout, publication does **not** require `i18n:sync`, new
static imports, or a generated manifest. For changes committed to the application
repository, continue to run `i18n:sync` so its bundled fallback remains consistent.
Default document title/description and `/api/interface-manifest` use the same
runtime English catalog. Interface language does not change dictionary data or
translation targets. Historical release notes remain separate content.

### Rollback and failure behavior

Activate an archived, compatible revision with the same publication tool:

```sh
npm run i18n:publish -- --catalog-dir /path/to/catalog-checkout --out-dir /path/to/catalog-volume --snapshot /path/to/catalog-volume/CONTRACT.REVISION.json
```

A valid server rollback wins over a newer browser cache; revisions are content
hashes, not a counter that could prevent rollback. Never edit an archive in place.
Retain archives needed for rollback through the operator's normal retention policy.
Hosted publication and volume provisioning follow the private managed operational
workflow; this public application change does not itself deploy or change traffic.

The server accepts only complete registries/catalogs with the expected format,
message structure and interpolation parameters, and a matching SHA-256 content
revision. A missing, truncated, incompatible or corrupted file leaves the last
verified snapshot active in that process, or the bundled fallback on a cold start.
File reads are bounded to 750 ms and snapshots to 8 MiB, 32 languages and 32 KiB per
message. The browser validates the bootstrap before mounting preference readers;
if needed it tries a bounded same-origin read, then a verified compatible local
copy, then its bundled fallback. The browser retains at most the current and one
previous contract cache. Blocked/full browser storage cannot block startup.
Catalog data is rendered as text; the document bootstrap escapes script delimiters.
Browser integrity verification uses Web Crypto (HTTPS or localhost); unsupported
contexts retain the bundled fallback.

### Mixed application versions

The compatibility contract hashes message keys, structure, nulls and placeholder
sets, **not** wording or enabled locale IDs. Existing wording and new translations
can therefore change independently of the build. Adding a UI element or a message
key, changing parameters, or changing rendering logic still requires code and a
new compatible application build. Catalog publication cannot create a new button.

Each binary requests `<its-contract>.json`; keep files for older contracts while
older replicas are deployed. An old client never consumes a new incompatible
snapshot: the endpoint returns 409 for a different requested contract and the
client retains its compatible cache/fallback. Publishing one contract never
removes another contract's active file. A single snapshot contains its registry and
all languages, so a new locale cannot become selectable before its text exists.

## Preparing and enabling a new language

English, Russian, Dutch and Ukrainian are registered. The following example
prepares Turkish, which remains disabled until explicitly registered.

1. `npm run i18n:prepare -- --locale tr` creates a draft catalog using English text
   and an empty review file. It refuses to overwrite an existing catalog.
2. Translate it with the screen context and terminology in mind. English text in
   the draft is source material, not a completed translation.
3. `npm run i18n:report -- --locale tr --json` lists outstanding work.
4. After language review, acknowledge completed keys, or explicitly use
   `npm run i18n:review -- --locale tr --all` for a fully reviewed catalog.
5. `node scripts/interface-localization.mjs check --locale tr` must pass.
6. Add `"tr": {"name": "Türkçe", "direction": "ltr"}` to
   `locales/registry.json`. This is the only hand-edited registration point.
7. Run `npm run i18n:sync` to regenerate static imports, then
   `npm run i18n:check`, `npm run typecheck` and relevant tests.
8. Check important screens at phone and desktop widths before releasing.

Draft catalogs are not shown in selectors until registered and published (or included
in the bundled fallback). Registered
catalogs must match the English shape; the application does not silently replace
missing translations with English. CI checks all registered languages.

For Arabic and Persian use `direction: "rtl"`. The registry and document effect
support direction metadata, and plural helpers support Arabic's six categories.
This groundwork does not certify full RTL layout support: mixed-direction
learning content, arrows, alignment, dialogs and fonts still need browser QA
before either language is enabled. Tigrinya also needs font coverage checks.

## Guardrails and scope

`npm run i18n:check` validates all registered catalogs, review state and generated
imports, then scans `.ts` and `.tsx` learner components, independent app pages
and client/presentation helpers. The audit covers JSX prose, text-bearing props,
local literal variables, templates, conditional text, column/label definitions,
static mapped arrays, displayed message state, raw formatter templates, and raw
error messages passed to UI sinks. Literal `platformV2Message` keys (including
local lookup wrappers) must also exist in the English catalog. `npm run i18n:audit` runs the source scan alone.

Exact semantic exceptions are listed with reasons in
`locales/copy-audit-exceptions.json`; unused exceptions fail the audit. These
cover dictionary identities (such as Dutch articles and grammatical labels),
not ordinary interface sentences. Adding a new JSX sentence cannot reuse an
exception for a semantic property. Diagnostic API/server modules and generated
catalog wiring are outside the learner UI source scan.

Static analysis is a guardrail, not a proof about every runtime string or an
automatic extractor/translator. Imported third-party content and novel dynamic
code patterns still require review. Contributors must use the catalogs even if
a particular expression is beyond the audit's static analysis. The type-level
registration probe independently detects fixed-locale assumptions.

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

The default page metadata also comes from `features.appMetadata`. `i18n:sync`
updates the bundled fallback manifest and `i18n:check` detects drift. Request-time
metadata and the active manifest endpoint use the validated runtime English
catalog. Learner account preferences are resolved client-side. Icons,
brand marks and the language's own native name remain identities rather than
translated prose. The audit also checks word-bearing CSS `content` literals and direct
`textContent`, `innerText` and `innerHTML` writes. Current measurement labels are
assigned from catalog-derived button text.
