-- Migration 142 changes only candidate eligibility. Cached clients retain the
-- same read RPC signatures, so the established pre-switch compatibility probe
-- remains authoritative.
\i db/deploy-contract/pre-switch-read-probe-141.sql
