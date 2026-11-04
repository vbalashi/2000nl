# Contributing

Keep changes focused. Explain the user-visible problem and how you checked the
change. Run typecheck, lint and relevant tests from `apps/ui`; database changes
also need the database contract suite.

All learner-facing interface text belongs in `apps/ui/locales`, including page
routes, buttons, table headers, tooltips, accessibility text, validation and
failure notices. Add a message with `npm run i18n:add -- --key ... --text ...`,
translate/review its entries, and read it through the catalog APIs in the UI.
Do not put prose in JSX, local string variables, column definitions, or message
setters. Never display raw provider errors as interface copy. Run
`npm run i18n:check` and `npm run i18n:check-registration` before submitting.
The [localization guide](docs/interface-localization.md) includes the complete
workflow and a settings-note example. Operator/admin localization is a separate
scope; learning content and user-authored names are not interface translations.

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
