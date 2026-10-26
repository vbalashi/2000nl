-- Migration 152 adds an idiom consumer boundary; retain the exact bounded
-- scheduler probe until the UI consumer is enabled.
\i db/deploy-contract/pre-switch-read-probe-151.sql
