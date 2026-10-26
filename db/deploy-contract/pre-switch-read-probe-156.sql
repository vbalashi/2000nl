-- The new finite-session ratio is a start-time ordering parameter, not a new
-- scheduler read path. Preserve the bounded, read-only QA selector probe.
\i db/deploy-contract/pre-switch-read-probe-155.sql
