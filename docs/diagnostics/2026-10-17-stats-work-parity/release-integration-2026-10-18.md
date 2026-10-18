# Prepared release integration230 / #735

Owner release authorization: [2026-10-18 decision](../../discussions/2026-10-18-01-audit-release-authorization.md).
This local preparation does not claim operational legacy closure or production rollout.

Starting Connect HEAD was `ee32f1316ed2e4420cfe107f9f25c40a4da94741`.
Merged current main `e068e559e71d2743cf4091cb5f5a28dcfadc842d` and Stats
`f964292e41a955b444b580f64cb39bb8176a6d41`. Resolved documentation conflicts by
retaining both accepted workstreams and bootstrap by preserving real229 then230;
the shared SSR correction is retained once. No node_modules sharing or secret edits.

The manifest now prepares a contiguous exact contract230, real229/230 checksums,
postflight230 and independently pinned read-only230, coordinationIssue735. Ledger,
pre-switch probe and compatibility phase are unchanged. **Rollout remains HOLD**
pending curator confirmation of the concrete legacy-credential closure procedure.
UI and gate tests explicitly assert `hold 230 735`; no check was weakened.

## Managed-gate blocker found and corrected before release registration

The original private/unreleased229 file lacked the managed gate's mandatory single
standalone BEGIN/COMMIT pair. Raw SQL/bootstrap checks did not catch that framing
omission; real `deploy_db_contract.mjs validate` did. Curator assigned the correction.
Only transaction framing was added; schema, ACL and credential semantics unchanged.

- Superseded private/pre-release229 digest:
  `71ee1d7fd07c0f1859e2d15da9e19464dc07648f49289c2fd2e0fb50489c2848`.
- Corrected229 digest registered for review:
  `82a7ae382d8f703fdffc0d25a5b2dbadce6a49374847e8faaae386f14d287dc2`.
- Unchanged230 digest:
  `a8ea4a2765a14c346d70f584900ad2ce1c774373000a73695871fd28f38f176b`.
- Read-only230 digest:
  `9394d66bdd097fdc8e4b679ee515be696dbb6029c41a6e841158e6e7a86debdc`.

The obsolete229 digest must not be used for release receipts. No applied production
migration was edited; neither229 nor230 has been deployed by this preparation.

## Local validation

- Managed manifest `validate`: PASS; `expected`: `2000nl-db-230 230`;
  `rollout-status`: `hold 230 735`.
- Real repository apply command exits78 on HOLD before reading any database URL;
  no temporary enabled release manifest or hold bypass used.
- Gate unit tests:19 passed; real disposable PostgreSQL gate integration:2 passed
  (atomic rollback/recovery, bounded read-only timing and write/timeout rejection).
- UI manifest deployment, health route and stats consumer:14 tests passed.
- UI typecheck passed. Migration numbering1..230 and bootstrap coverage passed.
- Owned fresh DB: actual compatibility + complete bootstrap including corrected229
  and unchanged230 + full forward postflight230 + independent Stats SQL parity: PASS.
- Full chained read-only postflight230 with session `default_transaction_read_only=on`:
  PASS, including inherited inner transaction boundaries.
- Connect DB ACL/concurrent code+refresh claims/revocation integration:1 passed on
  its own uniquely named disposable child DB, removed by its harness.
- `git diff --check`: PASS. No SQL semantic change or UI broad test repeat.

The parent disposable DB was removed after validation. Logs are retained in ignored
Connect checkout `tmp/release230-evidence/`. Operational retirement/descendant
coverage and historical JWT horizon remain separate required evidence; provisioned
server key and successful SQL probes alone do not close that boundary.
