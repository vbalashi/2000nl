-- Migration 149 only routes existing action/lifecycle writes through the
-- private clock seam; reuse the bounded read-only probe from migration 148.
\i db/deploy-contract/pre-switch-read-probe-148.sql
