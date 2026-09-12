-- Migration 148 only changes private clock routing; reuse the bounded
-- pre-switch probe from migration 147.
\i db/deploy-contract/pre-switch-read-probe-147.sql
