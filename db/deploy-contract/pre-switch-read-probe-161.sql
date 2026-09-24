-- The new idiom start is not exposed by the app until its UI consumer ships.
-- Retain the current bounded ordinary read gate during this additive rollout.
\i db/deploy-contract/pre-switch-read-probe-160.sql
