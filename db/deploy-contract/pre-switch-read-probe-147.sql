-- Migration 147 only tightens the existing read contract; reuse the bounded
-- pre-switch probe from migration 146.
\i db/deploy-contract/pre-switch-read-probe-146.sql
