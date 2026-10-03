# User registry: phase 1 review packet

Date: 2026-10-03. PR: [#570](https://github.com/vbalashi/2000nl/pull/570).
Owning issue: [#481](https://github.com/vbalashi/2000nl/issues/481), which remains
open for the later activity, content and access slices.

## What is ready for review

The first phase of the [registry contract](user-registry-phase-1.md) provides
operator-only account search, pagination and a read-only profile with saved
account facts and personal-list/link counts. No inferred Premium/payment state
is shown. The reserved profile tabs remain disabled.

| Requirement | Evidence |
| --- | --- |
| Dedicated `users.read` permission; private, non-cacheable responses; audited reads | Authorization, registry/profile route and audit tests; PR CI |
| Service-role-only SQL projection; operator identities excluded | `adminUserRegistryRpc.test.ts`, migrations 204–205, DB CI |
| Visible page size plus one lookahead row; no skipped users | 57-account/tied-date SQL regression, pages 26/26/7; repository tests for sizes 25/50/100 |
| Search returns to page 1; page boundary disables Next | Browser checks on actual `/admin/users` at 320, 390 and 1440 px with synthetic API responses |
| Long email, missing sign-in, confirmed zero/count values | Registry and profile browser checks; no horizontal document overflow at all three widths |
| Empty/error/unauthorized/forbidden/not-found views | Browser assertions on the actual headings at all three widths |
| Future access and payment features remain explicit | Disabled profile tabs; source limitations described in the contract |

The final visual check also verifies the profile avatar stays 40 × 40 px with a
long email. No page errors were recorded in the six registry/profile checks.
Next.js development diagnostics remain visible.

## Screenshots

These contain synthetic account data and intercepted API responses, not real
operator or learner data.

- [Registry, desktop](../../design/admin-user-registry-evidence/registry-desktop.png)
- [Profile, desktop](../../design/admin-user-registry-evidence/profile-desktop.png)
- [Registry, 320 px](../../design/admin-user-registry-evidence/registry-mobile.png)
- [Profile, 320 px](../../design/admin-user-registry-evidence/profile-mobile.png)

## Verification boundary

UI/API/DB checks passed on implementation commit `148ed87f` in PR CI; the final
avatar change is layout-only and has fresh browser and targeted lint checks.
Fresh PR CI runs on the final head as well.

The local wrapper correctly connects to local Supabase, but its live database
is still contract 195 while this branch requires 205. Therefore the screenshot
checks mock the admin API boundary. They are not a claim of successful live
operator-to-database browser integration. The real SQL projection was checked
in the disposable database harness, and server authorization/route behavior in
the automated suites. The shared local database was not advanced for this
visual review.

## Before rollout

Follow [the NUC rollout runbook](../../runbooks/admin-console-nuc-rollout.md):
review the exact head, validate the manifest and hold state, deploy migrations
204–205 with their pinned checksums and postflight, then verify a real
`users.read` operator session against contract 205. A learner-only session must
remain unable to read admin APIs. Review/merge is the deployment boundary;
this packet does not perform a rollout.

## Next implementation dependency

[#471](https://github.com/vbalashi/2000nl/issues/471) must define the authoritative
time-bounded Premium grant and overlap resolution before the profile can show
or change access. The admin access slice should consume that server-owned
projection. Payment facts need their own payment source; last sign-in must not
be presented as learning activity. Queue-filter and scheduler SQL are outside
this registry slice.
