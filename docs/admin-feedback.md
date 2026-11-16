# Feedback review access

The independent `2000nl-admin` reports screen uses the existing operator session and requires the explicit
`feedback.read` capability. It records list and detail reads in the operator
journal without copying report contents into audit records. `editorial.edit` is
reserved as an independent capability for a future reviewed editing workflow;
it grants no write access by itself. An operator can have both capabilities and
existing admin capabilities. Neither capability is automatically assigned to
existing operators. Provisioning must explicitly select the authorized account.

The report details are time-limited and may be absent even when the durable
classification remains. Editing and status updates are not yet
implemented. Dates in the filter use UTC. Managed deployment requires the
separately reviewed private forward migration, capability provisioning and the
normal release process; the public migrations are a fresh-install baseline.

The frontend is built in the separate Admin repository and mounted at `/admin/reports/` on the backend origin. This repository owns API and navigation links only. Login stays at `/admin` during this initial extraction. Separate-source deployment does not require a separate browser origin.

## Administrator sign-in and session lifetime

The administrative cookie/session is separate from the learner session. Google
uses PKCE and a server-verified identity. An installation may additionally enable
email-code sign-in with the server-only `ADMIN_EMAIL_OTP_ENABLED=true` setting.
Email login never creates an Auth user or grants operator access: verification rechecks the
current confirmed identity, operator binding and required audit before registering
the administrative session. Request acceptance does not confirm mail delivery
or reveal whether an address is registered. Codes never enter browser storage. A bounded HttpOnly navigation cookie preserves a validated reports link when the email opens in another tab; the destination is permission-checked again after sign-in.

Both methods use the same operator authorization and audit boundary. Administrative
cookies and the server registration expire after seven days; token refresh does
not extend that absolute registration deadline. Logout, session revocation and
operator deactivation or permission changes continue to apply immediately.
An installation must configure its own Google callback and mail provider; public
application code contains no provider client secret.
