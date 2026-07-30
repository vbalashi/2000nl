# Issue 97: recover training-session navigation evidence

Status: completed

Issue: https://github.com/vbalashi/2000nl/issues/97

## Objective

Recover only the still-relevant session/navigation evidence from preserved
commits `5e97c239` and `ca5fbe6a`, while keeping PR #88's newer dictionary
identity material authoritative.

## Fixed points and claims

- Base: `702b449352f6e3b064221e20964953e33d9c4b30`
- Preserved source tips:
  - `5e97c23906dc5ec1f5b6163624058b8b7ac7d8d7`
  - `ca5fbe6a78720da3ee2c1499ffc3bf29027a19a3`
- Related target-shell design issue: #72.
- Claimed paths:
  - proposed ADR 0005;
  - settings/training current-state evidence and task map;
  - the exact `TrainingScreen` characterization added by the preserved work.
- No Pen edit or product UI implementation is authorized.

## Classification rule

PR #88 versions of ADR 0003, the dictionary-identity inventory, audit script,
audit tests, and dictionary evidence are authoritative. A preserved path is
copied only when it is absent from current `main` and still supports issue #72.

Historical screenshots require a privacy review before any public push.

## Preserved-path disposition

| Preserved material | Disposition |
| --- | --- |
| ADR 0003, dictionary identity inventory, audit script/tests, dictionary evidence | Superseded by the integrated and evolved PR #88 versions; do not copy |
| ADR 0005 | Integrate as a proposed session-lifetime decision |
| Settings/training task map and Wave 0 evidence | Integrate as current-state evidence, not approved target design |
| `TrainingScreen` modal-navigation characterization | Integrate as a compatibility test |
| Historical edits to ingestion script notes and dictionary inventory | Superseded by current `main` and PR #88 |

## Slices

- [x] Verify the preserved source paths against current `main`.
- [x] Visually inspect every candidate screenshot for personal or account data.
- [x] Restore proposed ADR 0005 and current-state task-map evidence without
      treating either as target-design approval.
- [x] Port the `TrainingScreen` characterization and prove it against the
      current UI.
- [x] Record every preserved path as superseded, integrate, or restricted.
- [x] Run relevant UI tests, typecheck/lint, link/diff checks.
- [x] Close independent Standards review findings and rerun both reviews.
- [x] Push the exact SHA, open a draft PR, and record review-ready evidence.

## Integration evidence

- Final reviewed feature SHA:
  `4d85803e53679d3babb260cb35d46e2b26cba675`.
- Independent Standards review: PASS.
- Independent Spec/Architecture review: PASS.
- PR #100 UI check: PASS.
- Squash merge: `dfc2fd4c4ebb9a532e252515f4ceb450aa4aef40`.
- The SHA-256 of the complete feature patch and merged patch is identical:
  `3b666927728789e8a744c7a6c21cdb2746a3500f7f7a4f497a6328e60a7cc2f7`.
- Integrated `main` UI and deployment checks: PASS at the exact merge SHA.
- ADR 0005 remains proposed; no Pen or target-shell implementation was added.

## Stop rules

- Do not overwrite any PR #88 path with an older preserved version.
- Do not publish screenshots containing account or user-created data.
- Do not convert proposed ADR 0005 to accepted.
- Do not edit the canonical Pen or implement the target shell.
