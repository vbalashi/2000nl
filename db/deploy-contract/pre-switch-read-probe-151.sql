-- Migration 151 adds only gated content-bound exercise storage; reuse the
-- current bounded scheduler read probe until a consumer is enabled.
\i db/deploy-contract/pre-switch-read-probe-150.sql
