-- Migration 155 adds the idiom exercise consumer behind the existing
-- service/API boundary. The bounded scheduler read remains unchanged.
\i db/deploy-contract/pre-switch-read-probe-154.sql
