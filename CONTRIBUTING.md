# Contributing

Keep changes focused. Explain the user-visible problem and how you checked the
change. Run typecheck, lint and relevant tests from `apps/ui`; database changes
also need the database contract suite.

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
