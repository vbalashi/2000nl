# Platform Contract Change Checklist

Status: current checklist, 2026-06-23.

Use this checklist for issues or pull requests that change Platform lookup,
actions, provenance, read models, connected-client behavior, or external-client
contracts. Do not use it for unrelated UI-only changes.

Before implementation, link the issue to:

- [`platform-engineering-principles.md`](../architecture/post-provenance-review/platform-engineering-principles.md)
- [`platform-api.md`](platform-api.md)
- [`platform-provenance-rpc.md`](platform-provenance-rpc.md), when card action
  provenance or source context is affected

## Contract Impact

Mark every area that changes, or explicitly confirm that it does not change.

- [ ] Lookup remains read-only and does not perform card/user mutations.
- [ ] Action IDs and review result IDs remain compatible, or the change lists
  every added/renamed/removed ID.
- [ ] FSRS scheduling/review behavior is unchanged, or the change names the RPC,
  migration, and test coverage that updates it.
- [ ] Source-context versions are unchanged, or the change defines the new/updated
  producer contract and backward compatibility behavior.
- [ ] Privacy and retention rules are unchanged, or the change states which
  source, context, diagnostics, or user data becomes stored or exposed.
- [ ] Connected-client scopes are unchanged, or the change lists required scope
  and authorization updates.
- [ ] Public response shapes are unchanged, or Platform API docs and versioned
  route snapshots are updated.
- [ ] DB/RPC behavior is unchanged, or the change includes a new migration and
  live-DB rollout note.
- [ ] Platform API docs are updated when request/response/error behavior changes.
- [ ] External clients are unaffected, or the issue names affected clients such
  as AudioFilms or Pontix and includes fixtures/compatibility notes.

## Required Evidence

- [ ] Tests cover the changed Platform route or read model.
- [ ] DB/RPC tests cover changed mutation, idempotency, provenance, privacy, or
  FSRS behavior.
- [ ] Client fixtures are updated when an external-client contract changes.
- [ ] The issue comment records validation commands and whether a live DB
  migration was applied.
- [ ] If no runtime or DB behavior changed, the issue comment says so explicitly.

## Boundary Reminders

- 2000NL owns semantic contracts: principal/scopes, action IDs, FSRS, source
  normalization, privacy, read models, and user dictionaries.
- AudioFilms and other clients consume Platform contracts; they should not
  re-own 2000NL semantics.
- A shared SDK should not be introduced unless multiple active clients prove the
  need through repeated contract duplication.
