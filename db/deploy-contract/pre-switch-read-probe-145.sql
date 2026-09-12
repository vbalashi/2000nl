-- Migration 145 changes a write RPC body only. Keep the existing read-only
-- compatibility probe unchanged and let postflight assert the stored body.
\i db/deploy-contract/pre-switch-read-probe-144.sql
