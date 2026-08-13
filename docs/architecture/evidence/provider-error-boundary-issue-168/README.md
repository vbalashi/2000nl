# Provider-error boundary rollout evidence (#168)

Date: 2026-08-13

## Boundary decision

Translation providers may return diagnostics that echo request content or
credentials. Raw provider response bodies and messages therefore remain below
the translation provider boundary. Durable and public artifacts may contain
only:

- a closed failure code;
- a 24-character hexadecimal SHA-256 prefix used only for correlation;
- provider-selected/provider-used and fallback-used metadata.

All dictionary and text-translation read paths sanitize historical rows before
projection. Unknown metadata is dropped. Historical free-form error messages
are converted to the same safe code/fingerprint representation.

## Production read-only audit

The pre-rollout query inspected counts only; no diagnostic values were read.

```text
word_entry_translations overlays containing __meta.primaryError: 840
word_entry_translations legacy failed error_message rows: 0
platform_text_translations legacy failed error_message rows: 0
```

The 840 legacy values justify a bounded cleanup after compatible application
code is live. They are not useful product data and must not be copied into an
evidence artifact.

## Required rollout order

1. Deploy the compatible application code that stops new raw writes and
   sanitizes every read path.
2. Smoke a cached translation, a provider-backed translation, and a fallback
   translation; verify no `primaryError` key or provider body appears.
3. Run the following idempotent cleanup in one transaction:

   ```sql
   begin;

   update public.word_entry_translations
   set overlay = overlay #- '{__meta,primaryError}'
   where overlay->'__meta' ? 'primaryError';

   commit;
   ```

4. Verify the legacy-key count is zero and a second execution updates zero
   rows.

This cleanup deliberately deletes unsafe diagnostics and has no data rollback.
Application rollback remains safe because older code tolerates the absent
best-effort metadata field. If application deployment fails, do not run the
cleanup until the compatible read boundary is live.

