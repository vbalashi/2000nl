-- Migration 144 removes an unreachable private helper and retains every public
-- read signature. Reuse the exact bounded current probe.
\i db/deploy-contract/pre-switch-read-probe-143.sql
