# Dictionary publication and access

## Source and audience model

A dictionary is the source of dictionary entries. Collections keep references to
those entries; publication changes do not copy or delete collection items,
entry identity, or learning history.

Publication has three states:

- `unpublished`: ordinary readers cannot browse the source.
- `restricted`: readers need an active individual or named-group grant.
- `general`: readers can browse the source without a subscription requirement.

Personal dictionaries remain owner-only, even if a legacy visibility value is
changed. An operator may inspect source content only through the separately
granted `dictionary.content.read` permission, an explicit UI action, and a
successful audit write.

## Browsing and training are separate decisions

`can_browse_dictionary` is the reader-facing source gate used by the current
dictionary catalogs, search, direct-entry reads, connected-client lookup, and
collection availability projection. A general source is browseable regardless
of `minimum_subscription_tier` or the reader's Premium/tester diagnostic state.
A restricted source requires an individual or group grant; a tier entitlement
does not grant restricted-source access.

`can_access_dictionary` remains the existing training/learning gate while the
separate training-policy work is pending. It may still apply tier eligibility
to training from general sources. Queue candidate SQL and FSRS behavior are not
defined by the browse helper.

Search RPCs evaluate eligible dictionary sources inside SQL and resolve group
membership and grants through relational predicates in that request. The UI
does not fan out one grant lookup per word or entry. Public catalog reads expose
general-public sources only. Shared/private legacy visibility is not itself an
authorization decision.

## Revocation freshness

Publication and audience changes commit in the same database transaction.
Reader RPCs consult the current publication state, grants, and group membership
when each request starts; the application does not add a grant cache. A
revocation therefore affects new requests after the commit. A database request
already in progress may finish using its transaction snapshot, and content
already returned to a browser or connected client cannot be recalled. Clients
must issue a new lookup to get current access. Stored collection references
remain intact and become browseable again if access is restored.

## Collection behavior

Collection entries remain references to source entries. Collection summaries
may report total entries, currently browseable entries, and a count of
unavailable source dictionaries without naming those sources. The Library may
show a generic notice when a selected collection contains unavailable source
links; the underlying records and progress are retained.

## Operator content inspection

Opening dictionary metadata does not load entries. An operator with
`dictionary.content.read` must choose the explicit content-inspection action.
The endpoint is paginated, private/no-store, and writes a `dictionary.content.read`
audit event for each page before returning its content. This permission includes
personal dictionaries and should be granted only to operators who need it.
