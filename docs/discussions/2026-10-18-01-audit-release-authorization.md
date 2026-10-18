# Audit remediation release authorization

Date: 2026-10-18. Status: accepted release authorization; operational verification in progress.

The owner approved release with “Выпуск согласован” after the curator described the three prepared changes and the Connect transition that may require one-time reconnection. This supersedes the previous absence of release authorization; it does not establish that technical deployment gates or legacy retirement have passed.

PR #738 is independent of new database migrations and was merged at e068e559e71d2743cf4091cb5f5a28dcfadc842d. The ordinary NUC workflow owns its deployment and exact-SHA health verification.

Connect #735 and stats #737 require the real ordered 229 → 230 migration chain, immutable checksums, forward/read-only postflight and the managed deployment gate. The server-only credential key is provisioned without exposing its value. The local integration remains held until the curator verifies the concrete operational transition and release readiness; no held manifest may be bypassed.

Existing connected-client records cannot prove the historical user cohort complete. A release procedure must therefore address all potentially delegated native sessions and refresh descendants, using supported Auth operations verified on isolated synthetic users. A new issuer, current JWT expiry, or successful schema probes alone does not demonstrate retirement of all historical access tokens. Record the remaining historical-expiry uncertainty explicitly rather than declaring the security boundary closed.

No authorization is inferred to delete users, change passwords, read user content, weaken checks, or restore native Connect credential issuance. Operational credentials and user identities remain outside public reports.
