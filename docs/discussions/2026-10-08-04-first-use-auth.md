# First-use authentication and branded email

Date: 2026-10-08. Owner requested debugging/polish of all first-use screens and the email template after approving PWA #630. Issue #632.

Owning layer: apps/ui/components/auth, auth callback waiting surface and versioned template sources under supabase. No scheduler, account readiness, provider or authorization contract changes.

Observed locally at 390×844: old bold wordmark and saturated purple CTA, email-first layout despite documented Google primary, duplicate code-sent messaging, dense link fallback copy, raw provider errors and independently styled callback spinner. Existing source templates reside in scripts/update-supabase-email-templates.sh, use 2000.nl and blue header, and are not currently canonical standalone HTML files. Production effective template remains to be verified.

Accepted direction from current app/PWA standards: Inter regular wordmark, neutral/system and cached appearance, no heavy card shadow, sentence-case controls, Google and email routes, one code-entry step with accessible state/error feedback. Preserve existing manual-code fallback, resend and return-from-mail restoration. Add Russian UI parity. Proposed implementation will be presented as a separate reviewable slice; no production template change has been made.

## Owner email review
Owner selected English as the initial language and asked to review templates together before applying them. English magic-link/code, first-entry confirmation and recovery previews are available at localhost:4185. Language-aware delivery is proposed future work and requires agreeing how language is captured and maintained; no language metadata is sent by this slice. Existing production templates are untouched.

## Email copy refinement
Owner clarified that NL means New Language and the app covers any learning language, not Dutch/Netherlands. Remove instructional intro lines and Dutch marketing footer from auth emails. Keep concise single-use/link fallback details and unrequested-email footer. Requested copy action cannot run inside standard email clients because scripts/clipboard handlers are unsupported; code remains standalone selectable text, with user-select:all as progressive enhancement only. No inert copy button will be shipped.
