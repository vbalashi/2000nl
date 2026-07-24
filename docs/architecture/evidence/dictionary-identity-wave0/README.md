# Dictionary Identity Wave 0 Evidence

Status: reproducible corpus manifest prototype; not approved for cutover
Captured: 2026-07-24

This directory freezes a deterministic read-only inventory of
`db/data/words_content/*.json`. It makes the collision evidence in
`docs/architecture/dictionary-identity-wave0-inventory.md` reproducible without
changing the database or assigning Platform UUIDs.

## Reproduce

From the repository root:

```sh
python3 \
  packages/ingestion/scripts/dictionary_identity_wave0_audit.py
```

Verify that the tracked files still match the corpus:

```sh
python3 \
  packages/ingestion/scripts/dictionary_identity_wave0_audit.py --check
```

The generator has focused deterministic-output tests at
`packages/ingestion/tests/unit/test_dictionary_identity_wave0_audit.py`.

## Artifacts

- `manifest-v0.1.jsonl.gz` — one sorted record per JSON artifact, including
  artifact hash, current parsed identity, POS evidence, and a prototype content
  fingerprint.
- `audit-v0.1.json` — counts and hashes for the source tree and manifest.
- `collision-groups-v0.1.json` — every current
  `(headword, meaning_id)` group spanning multiple normalized payload POS
  values.

The captured corpus contains:

- 17,959 accepted artifacts and zero rejected artifacts;
- 17,389 current `(headword, meaning_id)` keys;
- 539 current-key groups spanning multiple payload POS values;
- at least 570 variants that cannot coexist under the current uniqueness rule.

The uncompressed manifest SHA-256 is:

```text
1e814f1c718e623bbaf083693eba887ba3aa427c522a12eea5b408c3932fad35
```

The source-tree SHA-256 is:

```text
80a417e2bbc767fae9f0824618258d7960cabc754cfa38f71d13c63a2be88e9f
```

## Limits

- This is a source-artifact manifest, not the future source-binding ledger.
- `filenamePosToken` is evidence only and is never promoted to proven POS.
- `parser-sanitized-json-v0.1` excludes `_raw_html`, but it is a Wave 0
  comparison fingerprint, not the approved identity fingerprint.
- The manifest does not match artifacts to current production UUIDs.
- Production counts, user-owned duplicates, soft UUID consumers, ambiguity
  decisions, and cutover pre/post checks remain outstanding.
- Re-running the generator after an intentional corpus change must produce a
  reviewed new artifact revision rather than silently redefining `v0.1`.
