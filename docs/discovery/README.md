# Discovery Notes

This folder holds evidence, product references, diagnostics, and working
conclusions that are not yet implementation plans or stable architecture
decisions.

Move material from here into `docs/intent/`, `docs/exec-plans/active/`,
`docs/reference/`, or `ARCHITECTURE.md` only after the direction is accepted.

## Active Indexes

- [Library collection picker production trace](./2026-10-15-collection-picker-production-trace.md)
  records the first bounded trace for issue #702. The [revised trace](./2026-10-15-collection-picker-production-trace-revised.md)
  adds page-wide DOM/network evidence; the click symptom is observed, but its
  underlying code cause remains unconfirmed.
- [Dictionary Search Performance Index](./2026-06-24-dictionary-search-performance-index.md)
  is the quick return point for the 2026-06-24 dictionary lookup/search latency
  and indexing work.
