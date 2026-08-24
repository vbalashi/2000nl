# Production Login (Testing/Troubleshooting)

Production UI: https://2000.dilum.io

The production `/dev/test-login` helper is intentionally disabled. Use a normal
OTP/OAuth login for personal testing. Automated production smoke checks must use
the dedicated QA account through the fail-closed wrapper:

```bash
scripts/ab-auth-prod.sh
```

## Required server-only configuration

Keep these values in a gitignored env file; never pass them to browser code:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`
- `QA_TEST_USER_EMAIL` — the dedicated QA identity
- `QA_TEST_USER_EMAIL_ALLOWLIST` — must explicitly contain that identity
- `QA_REFERENCE_USER_EMAILS` — comma-separated personal/reference identities
  that automation must never use

The Supabase Auth user must also have server-read
`app_metadata.is_qa_test_user: true`.

The legacy `TEST_USER_EMAIL` variable is not accepted by the production helper.
Its name never proves that an account is safe for automation.
The configured personal owner account is reference-only: its literal value may
appear in `QA_REFERENCE_USER_EMAILS`, but never as the QA identity or allowlist.

## Safety contract

Before opening production, the wrapper:

1. rejects missing or non-allowlisted QA configuration;
2. rejects every identity listed as personal/reference;
3. reads the Auth user and requires the durable QA marker;
4. exchanges the OTP and rechecks the exact email and user ID;
5. only then opens the site and installs the session.

On success, interruption, or failure after minting, it clears the browser auth
entry, globally revokes the QA session, and deletes local token artifacts. Do
not copy session JSON into another profile or bypass the wrapper with an inline
OTP script.

Every browser command has a 15-second outer process deadline. The final Today
check uses short, independently bounded probes for at most 30 seconds; it does
not rely on a timer inside the page or a second `networkidle` wait after session
reload. Today labels are matched case-insensitively across Dutch, English, and
Russian. A failed smoke reports one of these classes:

- `Browser harness failure` — the browser command timed out or failed;
- `App/auth failure` — the page remained visibly unauthenticated;
- `App surface failure` — authentication was present, but Today never appeared.

The wrapper then records a screenshot under `tmp/agent-browser/` and prints only
the production URL path, the fixed visible-state class, and counts of console,
page-error, and network records. Raw page/log/network content is never printed,
because it may contain session or personal data. Token artifacts still follow
the revocation-and-cleanup contract above. Before a diagnostic screenshot, the
wrapper covers the page with an opaque, fixed-content panel containing only the
safe failure class and production origin; it never persists raw app pixels. If
that privacy gate or any diagnostic command fails, the field says
`unavailable(privacy-gate-failed)`, `unavailable(timeout)`, or
`unavailable(command-failed)` instead of hiding the harness failure behind an
empty count.

Production smoke checks should be read-only unless an owning issue explicitly
authorizes a mutation. Loading the authenticated startup surface is safe;
revealing/grading cards, reporting, changing settings, and starting learning are
mutations and are outside a read-only smoke.

## Normal production login

For a human-owned session, open `https://2000.dilum.io` and log in via email OTP
or Google OAuth. Never point automation at that identity.
