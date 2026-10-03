# Approved variant A acceptance

2026-10-03. Production components in full local application, authenticated network fixtures. Counts are deterministic samples, not live DB measurements. No production writes.

`training-overview-layout.spec.ts` passed desktop1280x900 light and Russian390x844 dark. Both test100Saved rows; independent list scroll; Load34 updates selection/counts without starting session; exact hero position/height and list scrollTop remain unchanged; halfviewport height bound; pulse loading then settled real numbers; overflow-free width; hidden scrollbar; visible themed more indicator. NoSaved guidance retains hero. Mobile additionally resizes320x568 with reduced motion, checks primary action fully inside hero and no fade animation. Screenshots included.

Component contracts cover unknown/error/loading without fakezero, current-day counts distinct from all reviews/new, new-only filtering, empty-plan override of positive day-end counts, immutable accepted session metadata vsedited saved recipe, saved Load without launch,100 selectable records, and noSaved guidance. Metadata uses centralized capability table; hero and rows share session-limit formatting.

Local test harness must use `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` to match local wrapper authstorage key; defaultlocalhost auth key otherwise landslogin. BaseURL3100 server owned by root; this pass did not stop it.
