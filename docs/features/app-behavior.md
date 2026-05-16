# 2000nl App Behavior Reference

**Last updated:** 2026-03-22
**Purpose:** Canonical index for current app behavior. Start here, then open only the topical document you need.

## What This Covers

- Core training concepts and user-visible behavior
- Feature catalog grouped by domain
- Technical model and codebase routing
- Contributor workflow for updating behavior docs

## Read Order

1. [Core behavior](./app-behavior/core.md) for queue flow, states, and main UI primitives.
2. [Product features](./app-behavior/features.md) for user-facing changes and capability history.
3. [Developer tools](./app-behavior/developer-tools.md) for URL params, SRS history tooling, and debugging helpers.
4. [Technical model](./app-behavior/technical-model.md) for data model, code structure, backend integration, and development patterns.

## When To Update Which File

- Add or amend product behavior in [features.md](./app-behavior/features.md).
- Update queue logic, card states, or interaction model in [core.md](./app-behavior/core.md).
- Update testing/debugging helpers in [developer-tools.md](./app-behavior/developer-tools.md).
- Update table names, RPC contracts, file locations, or contributor guidance in [technical-model.md](./app-behavior/technical-model.md).

## Related Docs

- [docs/features/premium-features.md](./premium-features.md)
- [docs/features/onboarding.md](./onboarding.md)
- [docs/reference/api-functions.md](../reference/api-functions.md)
- [apps/ui/README.md](../../apps/ui/README.md)

_This index replaces the old monolithic behavior file so agents can load only the relevant section._
