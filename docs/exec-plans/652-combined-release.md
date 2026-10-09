# 2026-10-09 combined release (#652)

Owner explicitly requested review and publication of all outstanding PRs together.
Base: d2a879935979d10d269613939ec1a2b46b764ba7.
Owning checkout: .worktrees/652-combined-release, codex/652-combined-release.

Integrates exact reviewed heads of #144, #444, #556, #628, #637, #639, #645,
#646, #648 and #651 through merge commits. #406 is superseded: its migration156
collides with canonical156; the sentence consumer already shipped through166 and
later changes. Preserve its branch; do not reintroduce obsolete DB156.

## Standards

Independent review found one blocker: #406 violates immutable migration history
and latest-function ownership. No further release blockers in the ten accepted PRs.
Follow-up review of conflict resolutions found no blockers: shared function-stat
helpers preserve OID/signature checks; later diagnostic evidence is retained;
admin OAuth callback remains the authority; optional email hints stay compatible;
Library learning protections survive. Historical2s diagnostic gate references
are marked superseded by the current warning/safety-timeout contract.

## Spec

Independent review found #406 superseded. #646 is a partial #575 fix and must not
close its remaining no-due scope. #144 merges offline tooling only: owner blind
review remains a pilot/finalist promotion gate, with no corpus publication or
provider generation performed. #444 merges tools/evidence, leaving #440 attribution
criteria open. No implementation/spec blocker in the other accepted PRs.
Follow-up review confirms lifecycle, startup and both Translation fixes coexist.

## Integration corrections

The persistent rim initially covered only TrainingSessionSurface. Idiom and legacy
sentence runtimes call the lower layout directly; attach the same shared rim and
share its presentation with their headers. Their progress regression tests catch
the omission. Preserve the existing admin JSON{} request contract in its test.

## Validation and lifecycle

Local DB221 health and search-index probes pass. Ingestion:136 passed/12 skipped;
diagnostic unit tests:12 passed. Full UI:2164 passed/344 skipped across248 passing files. Browser:24 passed
with mocked transports and real components (initial login failures were a test
storage-key hostname mismatch, corrected via runner env). Final typecheck/lint pass,
with the existing handlePlayAudio warning. Disposable18,184-entry PostgreSQL
diagnostic passes after adapting the preserved assertion to the shared canonical
signature field. Guidance check passes after correcting a stale221 range.
DB drift CI initially hit Docker Hub unauthenticated limits; use the verified
public ECR mirror of the same official PostgreSQL17 service image.
Full CI exposed seven auth-bootstrap fixtures missing the now-required account
setup/material/scope reads. Install the shared complete backend fixture before
gating auth/preferences; all seven viewport/language cases pass locally.
The pinned contract-client image also uses the verified ECR mirror digest.
No DB migrations, manifest modifications, production data edits or corpus promotion.
All ten component PRs remain open until the single integration release merges.
Release deployment, exact production commit verification, reference-main sync,
and worktree retirement audit remain pending. Retain original dirty/active or
evidence-owning checkouts; do not remove merely to clean up.
