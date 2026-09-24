# Admin console QA evidence

Date: 2026-09-24. Scope: issue #480 first iteration.

## Results

- Server authorization unit checks cover missing auth, learner-only sessions, explicitly allowlisted shared identities,
  inactive/revoked operators, missing capability, live session checks, and
  fail-closed audit storage. Direct API route checks confirm denied requests do
  not invoke dictionary or journal reads.
- Projection checks cover bounded search/filter/pagination state, missing
  metadata, unsupported enum values, private dictionary content exclusion,
  audit event context, and omission of unrelated token/body fields.
- The local PostgreSQL migration/schema check ran transactionally against the
  local Supabase `postgres` database and rolled back. No production learner
  data or remote schema was changed.
- The local browser walkthrough used mocked API responses. Search, filter
  changes, pagination/return state, metadata detail, journal navigation, copy
  controls, desktop/mobile layouts, long names, bottom-of-page scrolling and
  no horizontal overflow were checked. There were no browser page errors.
- Direct API requests against the local app without the migration returned
  `503 unavailable` because the audit table is not installed in the shared
  local database; this is fail-closed and returns no data. The unit tests cover
  expected `401`/`403` outcomes with the authorization store available.

## Visual comparison

The `actual-*` screenshots capture the implemented `/admin` page with mocked
API responses. The unprefixed screenshots capture `/admin/preview` fixtures.
Both were compared side by side with the Pencil v0.3 REVIEW canvas. The page
keeps the same compact registry/detail/journal hierarchy, pale background,
white panels, blue active controls, and narrow mobile single-column flow.
Actual desktop detail and journal layouts remain readable; the 390 px mobile
captures have no horizontal overflow and allow scrolling through the complete
detail content. Pencil's canvas remains REVIEW and was not edited.

## Screenshots

- `actual-desktop-registry.png`, `actual-desktop-detail.png`,
  `actual-desktop-journal.png`
- `actual-mobile-registry.png`, `actual-mobile-detail.png`
- `desktop-registry.png`, `desktop-detail.png`, `desktop-journal.png`,
  `desktop-login-error.png`, `desktop-expired-session.png`
- `mobile-registry.png`, `mobile-detail-top.png`, `mobile-detail-bottom.png`,
  `mobile-journal.png`

## Limitations

The OAuth callback was not exercised against live Google credentials, and no
operator account was provisioned. The local UI database is on an older
contract and the existing local health report has no actual contract version;
therefore this is not a live Supabase authorization walkthrough. Production
redirect allowlisting, runtime secrets, trusted proxy chain, and scheduled-job
health still need deployment verification. No training filters, queues, or
FSRS behavior were changed.

## Shared Google identity follow-up (2026-09-24)

The owner selected an existing learner account for operator access. The admin
start/callback/authorization paths now allow an explicitly granted operator
regardless of learner-profile presence. Learner logout uses local Supabase
sign-out so it does not revoke the separate admin session. Google callback
and sign-out tests cover the existing email identity with linked Google,
wrong identity binding, failed exchanges, and preservation of learner state.
No learner profile, progress, subscription, filter, queue, or FSRS mutation is
introduced.

Read-only production checks confirmed the selected account already has Google
linked and a learner profile; Supabase permits concurrent sessions. The admin
schema is not deployed. NUC lacks ADMIN_SITE_URL; the reviewed Compose change
supplies the existing production origin by default at rollout. Supabase
currently allows only the learner callback; appending the admin callback
while retaining the learner URL is a rollout prerequisite.

Follow-up verification: 87 focused tests passed across authorization, Google
auth routes and the learner TrainingScreen regression suite. Typecheck passed;
lint passed with the existing TrainingSenseCardV2Session hook warning. Ten
additional AuthScreen, audit and dictionary-contract regression tests passed.
`shared-identity-session-check.json` records a real local Supabase check: two
sessions for one temporary user, logout and successful surviving-session
refresh in both directions, unchanged learner settings, and test-user cleanup.
The check exercises Supabase session behavior, not live Google OAuth.
