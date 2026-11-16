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
