# DB-owned bounded SenseCard report atoms

Status: proposed for architecture review under #199

Date: 2026-08-21

Related: #154, #190, #191, #197, #199

## Context

Diagnostic Report v1 freezes the exact authorized current-card text and later
submits it through one atomic report RPC. The database could previously verify
a Content Node ID and full-source fingerprint, but not a legitimate bounded
prefix: `private.platform_v2_content_nodes` did not retain canonical source
text or current source order. Hashing the submitted prefix cannot prove that it
is the deterministic prefix of the authorized full text. Application-projected
`contentRevision` also includes presentation fields that the report RPC cannot
reconstruct atomically.

Accepting client text, ordering nodes by creation time, or dereferencing a
diagnostic locator without retaining the result would weaken the trust
boundary. A signed client attestation would introduce secret rotation and a
new offline token into the report envelope.

## Decision

Persist the NFC canonical source text and current source order beside each
active private Platform V2 Content Node. Private reconciliation remains the
only writer. The versioned source-manifest importer supplies the trusted NFC
text to reconciliation and treats missing text or current order as an
incomplete projection that an identical manifest replay must repair. Existing
rows are backfilled only when their current diagnostic
locator resolves to exact canonical text; unresolved rows stay nullable and
Diagnostic Report verification fails closed without breaking ordinary lookup.

The database owns one deterministic source-atom projection:

1. headword;
2. definitions;
3. Usage Patterns;
4. each idiom root followed by its owned explanation and examples;
5. standalone examples;
6. Usage Notes.

The projector derives an opaque SHA-256 `reportContentRevision` from the full,
unbounded ordered projection. Platform lookup exposes this nullable opaque
revision beside the existing presentation `contentRevision`; the two revisions
are intentionally distinct. Diagnostic Report targets use
`reportContentRevision` as their `contentRevision`. A null value means the card
cannot yet supply automatically attached source atoms.

At verification time the database authorizes the entry for the supplied
server-derived principal, compares the opaque revision, normalizes to NFC,
clips each atom to 1,500 Unicode scalar values / 6,000 UTF-8 bytes, retains no
more than 32 atoms, enforces the exact 48 KiB canonical `cardContent` budget,
and computes the exact omitted remainder. The submitted JSON must equal that
projection. Duplicate, reordered, altered, stale, inaccessible, or
unverifiable input raises before the calling report transaction persists
anything.

The private table, reconciliation implementation, source projector, revision,
and bounded projector have no `service_role`, `authenticated`, or `anon`
execution/read grant. Two service-role-only `SECURITY DEFINER` functions form
the narrow server seam: read the attestation for an already authorized card,
and verify frozen atoms inside the future atomic submit transaction. Browser
roles have neither grant.

Displayed Translation atoms remain owned by #197. The source projector never
substitutes source text for a Translation Artifact or accepts a client-supplied
translation as canonical.

## Consequences

- Legitimate Unicode truncation is independently verifiable without storing a
  report, mutating learning state, or trusting the browser.
- Private user entries use the same projection while owner authorization is
  checked before any attestation is returned.
- Ordinary Platform lookup remains available for legacy rows, but report atom
  capture is fail-closed until exact text has been reconciled/backfilled.
- The private projection stores source text already present in dictionary
  storage. It creates no new browser/table read path and inherits source
  deletion through the Content Node entry foreign key.
- #190 may replace its `atomic_card_projection_unverifiable` branch only after
  this ADR and migration pass independent architecture/security review.
