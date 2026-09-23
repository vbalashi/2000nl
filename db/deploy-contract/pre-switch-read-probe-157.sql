-- Lexical filters do not change the default unfiltered read path. Keep the
-- bounded, read-only QA selector probe as an unchanged deployment gate.
\i db/deploy-contract/pre-switch-read-probe-156.sql
