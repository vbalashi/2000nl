# ADR 0019: Domain plan for bounded learning-material imports

Date: 2026-10-18. Status: **Proposed**, #742 under #685.

## Context

The owner requests in-app list import and later conversational tools, reviewed
personal generation and source adapters. Existing lookup/actions, private entries
and mixed manual collections cover useful primitives, but not a durable whole-import
plan or independent editorial acceptance. Read-only lookup must remain separate
from membership and learning actions.

## Proposed decision

Use a user-owned immutable versioned import plan and per-item receipts behind the
existing Platform domain boundary. Ship pasted text to one manual collection and
normal Training first. Add generation/review and conversation as consumers of the
same operations. Keep scheduler semantics in existing Postgres/RPC paths. Never
expose arbitrary SQL or model-supplied principal identity as tools.

Private generated content is distinct from shared dictionary publication and
personal overrides. Source extraction is separate from exact lexical resolution;
example occurrences are evidence, not new entry identities. AudioFilms owns YouTube
subtitle retrieval. No SDK/provider choice is made here.

## Consequences and acceptance boundary

The first slice does not require collection unions or paid generation. Durable
idempotency/partial results/compensating membership undo require their own verified
DB boundary; existing no-op membership and draft conflicts do not supply it.
Automatic replacement of manual Root acceptance remains an evaluation hypothesis;
without the quality gate it must remain editor-gated. No proposed schema/API is
implemented by this ADR.

[Discussion and owner requirements](../discussions/2026-10-18-01-agent-material-import.md).
[Design, evidence, limits and open decisions](../research/agent-import-742/README.md).
[Code audit](../research/agent-import-742-code-audit.md).
