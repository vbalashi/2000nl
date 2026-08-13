-- Preserve selected/actual provider provenance without storing provider diagnostics.

ALTER TABLE platform_text_translations
  ADD COLUMN IF NOT EXISTS provider_used text,
  ADD COLUMN IF NOT EXISTS used_fallback boolean NOT NULL DEFAULT false;
