# How it fits together

**The application** brings together your word library, collections, dictionary
lookup and practice sessions.

**The database** stores entries, accounts, access permissions and learning
progress. It also decides when a card should return for review. Supabase provides
account sign-in and live updates alongside PostgreSQL.

**Dictionary data is separate.** Open formats describe words, meanings, examples
and language-specific fields. You can supply compatible content without using
the maintainers' full dictionaries or private translation prompts.

**Optional services** provide AI translation and spoken audio. Their credentials
and private resources stay on the server.

**Connected applications** can offer other ways to encounter and save words.
AudioFilms focuses on listening and shadowing; Pontix focuses on browser
translation. 2000NL is intended to keep vocabulary and learning progress together
as these connections develop.

## Active training selection

Account learning preferences and the saved active scope are defaults for setup.
Their background reads continue to reconcile after account/collection hints and
reconnects. A successful Start or validated resume creates an owned copy of the
run selection through `useTrainingRunSelection`: language, exercise family,
scenario, directions, filter, material identity, mixing ratio and session size.
All exercise families use this ownership rule. Selection consumers use that
snapshot until an explicit replacement or authoritative takeover releases it;
catalog hydration cannot issue an implicit replacement command. Fresh defaults
remain available for subsequent setup rather than being discarded during a run.

This snapshot does not freeze learning progress, server plan revisions, material
access or authority checks. Those remain live. Theme, audio and translation
preferences also continue to update independently. A selected visible card must
have a current-card target before requesting display authority; missing target
context is a recoverable failure, never a pending request that cannot start.


## Meaning card spacing

Decision: [ADR-0001](adr/0001-meaning-direction-spacing.md).

Ordinary meaning sessions choose from the eligible candidate pool before applying
session size. Opposite directions of one meaning (`entry_id`) have at least three
intervening cards whenever a candidate outside that recent history is available.
The planner prefers the normal new/review rhythm, but can select from the other
category to avoid a nearby sibling. If all remaining candidates conflict, it uses the least
recent meaning instead of shortening the session. Different meanings of the same
headword remain independent.

The resulting order is stored with session membership and survives resume. A
replan after an external learning action includes the last three consumed members
when ordering its remainder. Candidates displaced beyond the session boundary
remain eligible with unchanged due times and memory state; ordering never creates
review grades or a next-day deferral. This applies to ordinary meaning training;
idiom and translation exercise queues retain their existing policies.

The public migration is for application installations. Applying the equivalent
change to the managed service requires its private forward-migration and release
process.

## Training diagnostics

Training emits bounded, content-free diagnostic events to authenticated,
same-origin `/api/diagnostics/training`. The server derives an HMAC account
pseudonym; clients cannot select an account identity. The endpoint logs validated
JSON and never writes learning state or diagnostic rows to Postgres.

`apps/ui/lib/diagnostics` owns the contract, foreground/online stall clock,
renderer observation, delivery and server request/RPC correlation. Ten foreground
online seconds without a ready card produces one stall event. Background/offline
time is excluded. User transitions and visible renderer loads are distinct;
`displayId` associates requests occurring during a visible load, while request IDs
and explicit transition IDs supply exact request correlation. Speculative reads
can share display context and must not be mistaken for causal proof.

The client queue, payload, authentication work, ingestion rate and per-request RPC
logging are bounded; diagnostic delivery is best effort and cannot block a card
request. Local memory is discarded on account changes/unmount. No card text,
email, URL parameters, tokens, request bodies or raw errors enter this channel.
Operators own log retention and alerting outside the application database.

### Runtime collection policy

Collection is off unless `TRAINING_DIAGNOSTICS_POLICY_PATH` names a readable,
valid operator-owned JSON file. Mount its **directory** read-only into every UI
replica (atomic replacement of a single-file bind mount can retain the old inode).
Do not serve or commit the live file: account UUID selectors are private.

The file contains `enabled`, `successSampleRate` (0–1), optional `detailedUntil`
for an explicit global investigation and `users` mapping account UUIDs to ISO UTC
expiry times. Ordinary operation uses `enabled: true`, `successSampleRate: 0.01`
and an empty `users` object. Failures and stalls are retained; successful events
are sampled consistently by load/request identity. Detailed grants are bounded to
24 hours and checked on every policy resolution, including cached configurations.

Operators can use `apps/ui/scripts/training-diagnostics-policy.mjs FILE baseline`,
`... FILE detail USER_UUID 30`, `... FILE detail all 15`, `... FILE off`, or
`... FILE status`. Baseline clears all detailed grants. Updates are atomic and
files are created mode 0600; provision the mounted directory with suitable ownership
for both the operator and application. Use account UUIDs from authorized account
administration, never emails or browser-supplied selectors.

Server policy refresh is at most five seconds. Authenticated first-party clients
receive only their effective policy via GET `/api/diagnostics/training`, refresh
it every 30 seconds, and fail closed after a failed refresh or the 90-second lease.
Expiry also bounds the client lease. POST ingestion independently enforces current
policy, so stale tabs cannot bypass a kill switch or select themselves for detail.
The same policy gates server route/RPC logs; early records before authentication
use only the global policy. This can omit a targeted request's initial start record,
while its authenticated completion/RPC records remain available. Policy reads add
at most one authenticated GET per active tab per 30 seconds. This does not change
existing browser console timings. Disabling collection stops diagnostic delivery
and log writes, while small local tracking hooks remain mounted.

Changing the live file after initial path/mount provisioning needs no rebuild or
restart. Policy errors fail closed; inspect file provisioning before treating an
absence of events as an absence of failures. Production mount provisioning and
operator changes follow the private managed release process.
