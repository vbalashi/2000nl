# Contributing

Keep changes focused. Explain the user-visible problem and how you checked the
change. Run typecheck, lint and relevant tests from `apps/ui`; database changes
also need the database contract suite.

For shared sheet, word-panel or resize changes, select browser tests by the
shared behavior and its consumers, not only the changed screen. For example,
changes to the Library sheet header or resize stops should also exercise
`training-word-panel-sequence.spec.ts`, `library-sheet-edges.spec.ts`,
`ux-pass-integration.spec.ts` and `unified-details.spec.ts` as applicable.
Run pilot-tagged tests with `APP_ROLLOUT_PROFILE=pilot`; inspect the test tags and
fixtures before selecting a command. If a deliberate behavior change affects an
existing assertion, update and run that test before pushing. Focused checks
provide early feedback; they do not replace the required CI suite.

All learner-facing interface text belongs in `apps/ui/locales`, including page
routes, buttons, table headers, tooltips, accessibility text, validation and
failure notices. Add a message with `npm run i18n:add -- --key ... --text ...`,
translate/review its entries, and read it through the catalog APIs in the UI.
Do not put prose in JSX, local string variables, column definitions, or message
setters. Never display raw provider errors as interface copy. Run
`npm run i18n:check` and `npm run i18n:check-registration` before submitting.
The [localization guide](docs/interface-localization.md) includes the complete
workflow, runtime publication and rollback, and a settings-note example. Operator/admin localization is a separate
scope; learning content and user-authored names are not interface translations.

Selection/counting changes also require the scale, request-failure recovery and
managed staging checks in [availability validation](docs/vocabulary-selection.md#availability-validation-before-release).

For interface changes, read the [interface standard](docs/ui/interface-standard.md) first. Reuse its shared components and semantic roles, and run `npm run check:interface-standard` from `apps/ui`. Review any reported deviation rather than adding an exception merely to pass the check.

Use synthetic fixtures. Do not submit production dictionary content, third-party
corpora, personal learning records, credentials or proprietary prompts. Generic
parsers may support external formats without bundling those external datasets.

Never edit a released numbered migration. Add a new migration and update its
schema/deployment checks. Keep learning-state mutations behind the existing
database and server boundaries.

Unless explicitly stated otherwise, contributions intentionally submitted for
inclusion are under Apache 2.0, as described in section 5 of the license. No
separate contributor agreement is currently required. Only contribute work you
have the necessary rights to submit.

For a security concern, use GitHub private vulnerability reporting when enabled;
do not publish credentials or exploit details in a public issue. No response-time
or commercial support guarantee is provided by this community repository.
