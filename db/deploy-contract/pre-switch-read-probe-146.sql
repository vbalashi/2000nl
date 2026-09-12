-- Migration 146 changes scheduler bookkeeping only; retain the bounded
-- read-only compatibility probe from the immediately preceding contract.
\i db/deploy-contract/pre-switch-read-probe-145.sql
