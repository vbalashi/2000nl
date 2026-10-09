# Real corpus verification for the isolated DB221 experiment

The local Van Dale corpus was verified against production system-source bindings on 2026-10-08. This is input verification, not a timing result or deployment change.

- Local `_manifest.jsonl`: 18,163 artifacts, SHA-256 `53496b238a88473891ecedd4a1f95151a05383d39c7a51d333bdb48a6e69b08b`.
- Production active `nl-vandale` source keys: exactly the same set of 18,163 keys; no missing or additional keys.
- Production curated memberships: `vandale-all` 17,408, `nt2-2000` 4,031, intersection 3,642. The isolated importer must restore these exact memberships by source key, rather than arbitrarily selecting rows or including all 18,163 in the full list.
- Content fingerprints: 18,162 match directly. The one difference is the known `drop` correction from #341, implemented in `packages/ingestion/scripts/reconcile_vandale_drop.py`. Its original fingerprint is `87fb3af13b29792a0ea5d58c7a2c5325a2c8bf386a4910e8007a74896d4621de`; approved/production fingerprint is `9f4726101b026171bb71dff91dd6532949a906980538f38c92475314f88bebe8`.
- The approved script’s pure parser correction was replayed locally and its resulting semantic fingerprint asserted equal to the production fingerprint. Both completed disposable runs applied the guarded correction to exactly one entry and one binding, then verified all 18,163 source keys and fingerprints against the captured production map.

The 17,408-member full collection is historical: the documented V2 import preserved 17,408 existing UUIDs and added 755 articles. See `docs/runbooks/vandale-v2-ui-and-operations-handoff.md`. Article count and full-collection membership count therefore need separate checks.

The production read exported only system-source keys, content fingerprints and two curated membership flags. No auth accounts, learner history, user collections or private dictionary content were exported. Raw dictionary payloads and membership maps remain ignored local artifacts. The reference corpus and canonical local database were not changed.

Input evidence is preserved under the ignored recovery directory `.worktrees/.reference-sync-backup-2026-10-08/622-release-measurement/catalog-local-process-reproduction/`. The membership-map SHA-256 is `17c06896826becd93778603a22ee92f668290b20b1752a6048de7d25ae15f4d2`. The completed timing evidence verifies imported fingerprints and memberships and records widths and physical sizes; the fresh 35,307,520-byte heap is smaller than the production 71,475,200-byte heap, so storage history is not equivalent. See `catalog-local-process-reproduction.md` for results and limits.
