-- The security migration changes no scheduler read path. Retain the exact
-- bounded, read-only readiness probe used for migration 157.
\i db/deploy-contract/pre-switch-read-probe-157.sql
