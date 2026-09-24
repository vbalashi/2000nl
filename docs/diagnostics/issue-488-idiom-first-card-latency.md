# Issue #488: idiom first-card latency

Date: 2026-09-24  
Environment: authorized production database (`2000nl-db-163`), production
application `0.18.794` at commit `ff041b8187ab7b0acbc7eb270eeaafa71f62bddb`

## Method

The measurements used the linked Supabase CLI against the production project.
The SQL set the authenticated principal to the authorized smoke-test account,
then called the same security-definer functions used by the application. The
start-session timing ran inside an anonymous PL/pgSQL block that deliberately
raised an exception after measuring; the transaction was therefore rolled back
and did not create a session or change learner state. The read-only lookup
measurements used `EXPLAIN (ANALYZE, BUFFERS, TIMING ON, FORMAT JSON)`.

The first-card smoke path had already been verified in the authorized Chrome
session: the session shell appeared, the first idiom rendered with its
expression, explanation, and example content, and returning to Today preserved
the server-backed session.

## Results

| Phase | Cold-ish observation | Warm observation | Interpretation |
| --- | ---: | ---: | --- |
| `start_platform_v2_idiom_training_session` | 4,359.64 ms | 205.92 ms | Candidate ordering, session-member writes, and the session response share the cold path. |
| `read_platform_v2_idiom_training_session_next` | 11.83 ms | — | The member selection and exact target checks are not the dominant phase. |
| `read_platform_v2_training_group` for a complete idiom entry | 3,490.91 ms, 144,459 shared hits | 262.44 ms | Full group/projection assembly is the dominant first-card content phase. |
| `read_platform_v2_training_group` for a nonexistent entry | 6.55 ms, 1,018 shared hits | 5.34 ms | Empty resolution is cheap; the delay is tied to materializing a real group. |

The timings explain the observed browser smoke in which the first idiom card
took roughly 19 seconds, with about seven seconds in preparation/content work.
The residual browser time includes authenticated RPC transfer, app scheduling,
and React rendering; it does not change the database attribution above.

## Attribution

The dominant phase is the authenticated content projection for a complete
entry, with a second cold contribution from session candidate construction.
`session-next` itself is fast. This is consistent with a managed-database cold
buffer/cache effect amplified by a broad `read_platform_v2_training_group`
projection, rather than a need to increase the release timeout or move to a
dedicated instance.

The projection split makes the next SQL seam more specific. On the same
complete group, the group-member aggregation itself was about 16 ms and the
base presentation-identity function about 90 ms warm (44,914 shared hits). The
remaining cold cost is in the attested identity wrapper, which computes a
report-content revision for every returned entry; the six-entry identity call
alone measured about 2,950 ms cold-ish and 144,178 shared hits. This points to
the per-entry report-atom revision work and its repeated content-node checks as
the first query to profile before changing the broader group lookup.

## Next bounded work

1. Keep the new browser events from PR #494 in the production build so the next
   authorized smoke separates `idiom.session-start`, `idiom.session-next`,
   `idiom.content-lookup`, and card readiness on the real network path.
2. Review the function-level plan and the complete-group query shape before any
   SQL change. Start with the per-entry report-atom revision/attestation work;
   then consider a target-scoped content projection that preserves exact
   content-node and dictionary-access checks, rather than returning the whole
   headword group for the first idiom card.
3. Separately decide whether the UI should show a responsive idiom shell while
   the first content projection is pending. This must not bypass the current
   exact-target or access checks.

No infrastructure resize, timeout increase, scheduler change, or learner-state
mutation was made as part of this measurement.
