# Reports

This folder stores archival reports, implementation writeups, audits, and generated analysis output.

## Layout

- Top-level `reports/`:
  - human-authored audits
  - implementation summaries
  - one-off investigation notes
- `reports/generated/`:
  - generated SRS analysis exports
  - machine-produced markdown/json/csv artifacts

## Guidance

- Do not treat `reports/` as canonical product documentation.
- If a report becomes part of the ongoing operating model, move the stable guidance into `docs/`.
- Prefer adding short summary links from `docs/tech-debt/` or `docs/reference/` instead of duplicating full report contents.
