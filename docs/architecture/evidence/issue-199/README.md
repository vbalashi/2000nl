# Issue 199 — bounded SenseCard report atom attestation

Base: `72593d1f6b40da6cfc8b67e7d5f8472313208346`.

## Red characterization

The first DB/RPC test run failed all five initial cases because
`public.read_platform_v2_report_atom_attestation` did not exist. The existing
database could authorize an entry and compare a full-source fingerprint, but
it could not reconstruct canonical atom text, source order, a legitimate
truncated prefix, or the exact omitted remainder. #190 therefore correctly
failed every non-null `cardContent` as
`atomic_card_projection_unverifiable`.

## Implemented boundary

- private Content Nodes retain nullable NFC canonical source text and current
  source order;
- the versioned source-manifest ingestion producer supplies exact NFC source
  text for every reconciled node, and its completed-manifest no-op check also
  verifies canonical text and current order so an incomplete projection is
  repaired on replay;
- reconciliation persists exact text for new/updated nodes and a conservative
  locator backfill fills only resolvable existing rows;
- unresolved legacy rows remain usable for lookup but fail report attestation;
- a DB-owned opaque report revision changes with full text, identity, ownership
  order, or atom order;
- the source projector owns headword, definition, Usage Pattern, example,
  idiom/explanation, and Usage Note roles;
- the bounded projector owns NFC, 1,500-scalar / 6,000-byte per-atom limits,
  32 atoms, 48 KiB canonical card content, and exact omitted count;
- service-role-only attestation/verify RPCs authorize the principal and expose
  no private table or projector grant;
- Platform V2 SenseCard responses carry nullable `reportContentRevision`
  separately from their existing presentation `contentRevision`.

Displayed translations are deliberately absent: #197 owns independently
verifiable Translation Artifact atoms. No Report UI, outbox, Feedback Item
persistence, scheduler/FSRS behavior, #143, or #144 changed.

## Focused evidence

`platformV2ReportAtomsRpc.test.ts` covers:

- exact full text and report/idiom priority;
- source reordering changes both the ordered projection and opaque revision;
- NFC and Unicode/UTF-8 truncation;
- 32-atom and 48 KiB clipping with exact omitted count;
- duplicate, reordered, altered, altered-count, and stale-revision rejection;
- unresolved legacy fail-closed behavior;
- private-entry owner success and cross-user denial;
- absence of direct private/table/browser grants and the internal role gate.

`platformV2LookupRoute.test.ts` proves the opaque report revision survives the
embedded identity and public SenseCard projection without changing visible UI.

`test_source_import_keeps_report_atoms_verifiable_across_reimport` drives the
real checksummed source-manifest importer into the public report-attestation
RPC. It proves the first import yields NFC source atoms, an incomplete stored
projection makes an identical manifest replay repair rather than no-op, a
changed import changes both the atom and report revision, and a later identical
replay preserves the exact attestation.

## Validation on the uncommitted worktree

- clean local Supabase reset plus the complete bootstrap, including migration
  120: passed;
- immediate reapplication of migration 120: passed, with no duplicate object or
  rename failure;
- all database-backed FSRS/Platform RPC tests: 88 passed across 5 files,
  including 8 focused report-atom cases;
- all ingestion unit/integration tests: 32 passed, including the real
  producer-to-RPC import/re-import case;
- full no-database Vitest run: 712 passed and 88 DB-only tests skipped by the
  no-database run (the same DB-only set was exercised separately above);
- public Platform V2 lookup route: 16 passed;
- projection and immutable consumer contract checks: 14 passed;
- TypeScript and ESLint: passed with no errors or warnings;
- `git diff --check`: passed.

No browser/UI run is claimed because this slice adds no Report control or
visible card state. Its user-facing boundary is the existing Platform V2 JSON
projection, covered by the route and immutable consumer contract tests.
