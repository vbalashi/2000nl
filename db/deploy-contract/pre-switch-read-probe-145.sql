-- Migration 145 changes only the statistics attribution helper and preserves
-- the current selector/read contracts. Reuse the exact bounded current probe.
\i db/deploy-contract/pre-switch-read-probe-144.sql
