# Staged Connect cutover under the approved release

Date: 2026-10-18. Status: curator execution decision within the owner's explicit release authorization; historical security closure OPEN.

The [owner approved release](2026-10-18-01-audit-release-authorization.md), after being informed of possible one-time reconnection. The curator chooses a staged release: deploy the complete opaque issuer and SQL230 first, then immediately retire potentially delegated native refresh sessions. Retirement must follow the new-issuer cutoff; it cannot safely precede an issuer that would create more native credentials.

This explicitly replaces the prior requirement to establish historical closure before enabling any deployment. It does not mark that closure passed. Current JWT expiry cannot establish the maximum historical lifetime. Old access JWT rejection remains unverified until config history or an independently reviewed equivalent provides a defensible bound.

Deployment-phase prerequisites now verified: dedicated server-only key provisioned; actual 229→230 checksummed managed contract and full forward/read-only probes; separate Standards/Spec integration review; rollback guard that prohibits restoring a legacy issuer; full combined UI2514 pass; read-only production cohort of all19 users eligible. The supported operator was tested on disposable GoTrue v2.197.0, matching production, including original and independently refreshed descendants, outage rejection, cleanup and resume. Ordinary operational rereview accepts it for refresh-session retirement, not full JWT closure.

Operator SHA256:20bd03f79bd591ec040f5a0a246957f79c3ff67b5e613da16f372581982e9d7e. It runs only against the reviewed origin and exact private cohort hash/count, keeps credentials in memory, and writes a private0600 phase journal. The procedure admin.generateLink→verifyOtp→admin.signOut(global) uses a temporary session solely to retire native sessions; it sends no email or password/metadata change. Side effects include all-user reconnection, last-sign-in/Auth audit updates, and possible replacement of outstanding magic-link tokens. Production user content is not accessed.

Sequence: exact-SHA/DB230/worker health → record cutoff → revalidate cohort → supported global retirement → classified refresh rejection and complete private journal → independent read-only zero pre-cutoff auth.sessions check. Ambiguous/partial failures remain incomplete and require journal-based cleanup. Never delete production auth.sessions as an incidental migration or restore the old native issuer. Future opaque image rollback is allowed only by the tested compatibility marker.

No production retirement or final security closure is claimed by this planning record. Record actual receipts separately after execution.
