---
name: Platform contract change
about: Track 2000NL Platform API, provenance, read-model, or external-client contract changes
title: "Platform contract: "
labels: 2000nl, needs-triage
assignees: ""
---

## Context

Link the user story, bug, architecture note, or external-client need.

Required references:

- Engineering principles: `docs/architecture/post-provenance-review/platform-engineering-principles.md`
- Checklist reference: `docs/reference/platform-contract-change-checklist.md`

## Contract Impact

Mark every affected area, or leave unchecked only when it is explicitly not
affected.

- [ ] Lookup read-only behavior
- [ ] Action IDs or review result IDs
- [ ] FSRS scheduling/review behavior
- [ ] Source-context versions or producer contract
- [ ] Privacy, retention, or diagnostic data exposure
- [ ] Connected-client scopes or authorization
- [ ] Public request/response/error shapes
- [ ] DB/RPC behavior or migrations
- [ ] Platform API docs
- [ ] External clients such as AudioFilms or Pontix

## Implementation Notes

- Owner repository:
- Affected routes/RPCs:
- Expected backward compatibility:
- Live DB migration required: yes/no

## Validation Plan

- [ ] Route/read-model tests:
- [ ] DB/RPC tests:
- [ ] Client fixtures or client smoke tests:
- [ ] Docs updated:
- [ ] Issue comments will record validation commands and live DB status.
