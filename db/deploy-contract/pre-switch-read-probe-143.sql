-- Migration 143 adds write-maintained introduction eligibility while retaining
-- the established public read signatures. Keep the exact cached-client probe.
\i db/deploy-contract/pre-switch-read-probe-142.sql
