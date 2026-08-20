# Platform V2 consumer fixtures

`manifest.json` is the consumer pin. A consumer must pass these exact fixtures
before enabling its V2 adapter. Fixtures contain only public Platform DTO
fields; provider `raw` data and diagnostic `sourcePath` values are forbidden.

- `catalog-single-sense.json` covers a public, non-mutating SenseCard and pins
  the entry-level translation artifact, including alternatives and base text.
- `catalog-cross-reference.json` covers a redirect-only dictionary record that
  must never become a learning card.
- `known-action-roundtrip.json` pins server-owned Mark/Undo targets and the
  complete Undo response that restores the preserved scheduler state.
  Consumers must not synthesize Known state, mark IDs, revisions, or rollback
  locally.
- `rollout-matrix.json` pins allowed independent consumer/server combinations
  and the consumer-first rollback order.

2000NL validates these files against its projection. AudioFilms should vendor
or fetch the same manifest version and record it in its adapter test.
