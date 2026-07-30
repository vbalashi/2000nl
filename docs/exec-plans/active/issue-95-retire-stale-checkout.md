# Issue 95: retire the stale default checkout

Status: active

Issue: https://github.com/vbalashi/2000nl/issues/95

## Objective

Turn `/Users/khrustal/dev/2000nl` into a clean checkout of integrated `main`
without losing the three divergent commits or any local-only product, design,
Pen, QA, or render evidence.

## Fixed points

- Integrated recovery commit: `702b449352f6e3b064221e20964953e33d9c4b30`
- Stale checkout HEAD: `ca5fbe6a78720da3ee2c1499ffc3bf29027a19a3`
- Preservation branch: `preserve/stale-main-commits-2026-07-30`
- Preservation branch tip: `ca5fbe6a78720da3ee2c1499ffc3bf29027a19a3`
- Retirement worktree:
  `/Users/khrustal/adhoc/2000nl-issue-95-retire-stale-checkout`

## Classification rules

Each divergent commit and local-only path must receive one disposition:

- `integrate`: still-needed work moved through a reviewed branch;
- `superseded`: the integrated repository contains an equivalent or newer
  result, with patch or content evidence;
- `archive`: durable evidence retained outside the default checkout with an
  explicit location;
- `generated`: reproducible output removed only after its provenance and
  reproducibility are recorded.

Silence in `git status` is not evidence of safe classification.

## Slices

- [x] Verify PR #94 integration and create a clean issue worktree.
- [x] Classify the three preserved commits against integrated `main`.
- [x] Inventory every untracked path, size, provenance, and canonical owner.
- [x] Move or commit durable product/design evidence to explicit owners.
- [x] Archive or deliberately remove reproducible generated artifacts.
- [x] Prove every old-checkout item is remotely or durably reachable.
- [ ] Update the default checkout to current `origin/main`.
- [ ] Verify the default checkout is clean and document its safe-use rule.
- [ ] Run independent Standards and Spec reviews on the retirement evidence.
- [ ] Push the exact retirement SHA and record the final checkpoint.

## Classification

| Source | Disposition | Evidence |
| --- | --- | --- |
| Working diff recovered by #94 | superseded | Integrated as `702b449352f6e3b064221e20964953e33d9c4b30`; the rich cache contract was versioned to V2 during review. |
| `c21a073f` grouped-search fallback | integrate separately | Issue #96 owns a collision-free port. Historical migration number 102 now conflicts with the integrated source-entry migration. |
| `5e97c239` ADR 0003 and dictionary inventory | superseded | PR #88 integrated and evolved these files. |
| `5e97c239` proposed ADR 0004 | integrate separately | Missing from `main`; issue #97 owns current-context review and recovery. |
| `ca5fbe6a` dictionary audit script, tests, and evidence | superseded | PR #88 integrated the current authoritative versions. |
| `ca5fbe6a` session/settings evidence, task map, and TrainingScreen characterization | integrate separately | Missing from `main`; issue #97 owns path-by-path review and recovery. |
| `2026-07-06_notes.md`, training-scope brief/review, `docs/interface-review.md` | integrate | Curated under `docs/intent/training-scope-redesign/` in this branch. |
| Training-scope screenshots 01–04 | restricted local archive | Excluded from the public PR because two contain an account email and user-created list names. |
| `.codex-exports/`, `_qa/`, `_render_check/` | restricted local archive | Exact bytes and hashes are retained under `/Users/khrustal/archive/2000nl/stale-main-2026-07-30`; public publication is prohibited pending privacy review. |
| `2000nl.pen`, `untitled.pen` | restricted local archive | Exact encrypted binaries and hashes are retained locally; neither overwrites the canonical shared Pen. |
| Untracked migration 103 | superseded and archived | Exact hash was recovered by #94 and also remains in the restricted local snapshot. |

## Preservation evidence

- Historical commits branch:
  `preserve/stale-main-commits-2026-07-30` at
  `ca5fbe6a78720da3ee2c1499ffc3bf29027a19a3`.
- Restricted local-artifact archive:
  `/Users/khrustal/archive/2000nl/stale-main-2026-07-30`.
- The archive is mode `0700` and contains `SHA256SUMS` covering every preserved
  local-only file. The initial remote branch was deleted immediately after
  personal data was identified; its payload must not be published.
- Follow-up implementation issues: #96 and #97.

## Stop rules

- Do not reset, clean, stash, delete, or bulk-add the default checkout before
  every path has a recorded disposition.
- Do not combine the preserved lexical-search migration with design evidence.
- Do not overwrite the canonical program Pen file at
  `/Users/khrustal/dev/pens/2000nl-audiofilms.pen`.
- Stop on content ambiguity: archive first, then ask for product ownership.
- Keep the preserved-commits branch and restricted local archive until the
  owner accepts the final retirement checkpoint and chooses a private backup
  destination for local-only payloads.
