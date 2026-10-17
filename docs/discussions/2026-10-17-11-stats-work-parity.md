# Ordinary statistics: remove discarded UTC daily work (#737)

Date: 2026-10-17. Source: owner approved parallel implementation after the audit;
curator assigned #737. Status: accepted investigation; implementation conditional
on independent parity and measured local work reduction. No production claim.

The DB owns this read projection. Preserve both public RPC overloads, authenticated
owner checks, stored timezone authority, the effective local helper after
145/147/169/192/217, training dictionary access and the three base metrics.
Do not change scheduling or UI refresh policy.

First characterize old JSON using the unmodified legacy helper plus the effective
local helper, independently of the new totals projection. Measure discarded nested
query work on a disposable database. If meaningful, add a narrow private totals
projection and replace only the five-argument wrapper's base call. Retain the old
private legacy helper for compatibility and an independent regression oracle.
Avoid merging scopes or rewriting local eligibility in this change.

Migration 230 follows reserved Connect migration 229. This branch must not advance
the deployment manifest, required app contract, or enable rollout. Curator will
integrate a reviewed checksum and postflight after 229. No production access or
writes are part of #737. Alternatives: defer when negligible; full aggregate
rewrite rejected because it expands semantic risk beyond proven redundant work.
