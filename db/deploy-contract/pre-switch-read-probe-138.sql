-- Shared Learn/Known changes do not widen the bounded selector smoke. Keep the
-- established read-only plan and selector probe as the pre-switch gate.
\i db/deploy-contract/pre-switch-read-probe-137.sql
