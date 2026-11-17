# Translation and audio generation safety

The text, generated-draft and TTS APIs authenticate before looking up an artifact.
Connected clients still need `platform:write`; first-party requests use the same
existing authentication interface. `POST /api/tts` now always requires this
identity, including installations that do not enable optional admission. Its GET
continues to serve only public 16-hex keys; entry audio has a separate 64-hex
namespace and retains its live source/access checks before and after resolution.

## Input and technical admission

All generation inputs are bounded before provider calls. Streaming JSON reads
have a byte envelope of `12 * max characters + 32768`, allowing escaped Unicode
and metadata without accepting unlimited ignored fields. String limits count
Unicode code points and independently bound UTF-8 bytes to four times that limit.

| Setting | Default | Maximum accepted configuration |
| --- | ---: | ---: |
| `PROVIDER_TRANSLATION_MAX_CHARACTERS` | 24600, across texts and context | 100000 |
| `PROVIDER_TRANSLATION_MAX_ITEMS` | 128, including context if present | 512 |
| `PROVIDER_TRANSLATION_MAX_OUTPUT_TOKENS` | 8192 for ordinary OpenAI/Gemini calls | 32768 |
| `PROVIDER_AUDIO_MAX_CHARACTERS` | 2000 | 8000 |

Translation defaults reuse the dictionary request character/item envelope. The
2000-character audio default preserves the existing entry-example allowance and
also accepts long phrase consumers of the legacy endpoint. The source resolver
still bounds dictionary headwords to 160 and entry examples to 2000 characters.
Prepared dictionary audio does not initiate paid generation.

The following settings exist separately with the prefix `PROVIDER_TRANSLATION_`
or `PROVIDER_AUDIO_`. Set the same values on every UI replica. Invalid values
fail closed; none of these settings is browser-controlled.

| Suffix | Default | Maximum accepted configuration |
| --- | ---: | ---: |
| `REQUESTS_PER_MINUTE` | 20 starts/account | 1000 |
| `GLOBAL_REQUESTS_PER_MINUTE` | 200 starts | 10000 |
| `CHARACTERS_PER_MINUTE` | configured max input times account starts | 100000000 |
| `GLOBAL_CHARACTERS_PER_MINUTE` | configured max input times global starts | 1000000000 |
| `ACCOUNT_CONCURRENCY` | 2 active generations | 32 |
| `GLOBAL_CONCURRENCY` | 2 active generations | 128 |

These are configurable technical overload controls, not subscription allowances
or a currency budget. Translation and draft calls share a family; public and
private TTS calls share another. Postgres checks both global and account capacity
atomically in a short transaction. A claim reserves one start and its input
characters in fixed 60-second windows. Cache hits, coalesced requests and rejected
claims do not reserve generation units. Success/failure releases the active slot;
failed attempts keep their spent minute reservation. Provider transport retries
and fallback occur inside that one bounded operation, so reservation counts are
not billed request counts. Ordinary output tokens are capped; dictionary jobs
retain their existing profile/output limits and separate queue admission.

Read-only consumer checks covered AudioFilms phrase/span translation and its
dictionary-audio proxy; Pontix currently has no call to these APIs in its source.
Allowed text purposes preserve established connected-client values:
`youtube-phrase-practice`, `youtube-recall`, `youtube-span-translation`,
`pontix-phrase`, `manual-dictionary-card`, `dictionary-headword`,
`dictionary-meaning`. An arbitrary purpose cannot create another paid cache key.
Audio keeps its existing purpose allowlist. Language/voice selection is unchanged.

## Recovery and response compatibility

Migration 376 adds server-only coordinator RPCs. They require `service_role`, not
browser JWT/session claims. Tables live in `private`, have RLS enabled and grant
no direct application-role access. Text/draft keys include the account, normalized
request, provider configuration, prompt revision and protocol revision. The v3
text protocol does not consult historical `platform_text_translations` records;
old pending/failed rows cannot block new requests. Response fields for ready text,
literal translations, comments and provider/fallback provenance are preserved.
The opaque translation ID and `translationPolicyVersion` advance to v3.

A confirmed claim gets a random token and a 300-second lease. Network generation
has a 240-second operation deadline, with fetch cancellation inherited by retries
and fallback and cancellable Google GAX calls using only the remaining deadline for each
voice fallback; SDK transport retries are disabled inside that operation. No transaction remains
open during I/O. Publication/failure checks token, status and expiry after taking
the row lock. A late owner cannot publish or make a local TTS file visible.

Failed attempts back off 5 then 20 seconds. The third failure has a 15-minute
cooldown; a subsequent admitted request starts a new three-attempt episode.
Expired pending leases recover under the same fence and backoff. There is no
unbounded immediate retry loop. An unconfirmed DB response fails closed and leaves
recovery to the lease. A process may still die after a provider accepts a request;
transport cancellation cannot guarantee cancellation of provider-side billing.

Concurrent text requests return HTTP 200 `status: pending` with `retryAfterMs`.
TTS waits at most two seconds for another generator's shared result, then returns
retryable HTTP 503 `audio_pending`. Admission returns 429 `rate_limited`, provider
failure returns 502 with a closed error code, and coordination/lease uncertainty
returns 503. No raw provider diagnostics are sent to clients. TTS and text responses include
`Retry-After` when applicable, alongside `retryAfterMs` in their JSON.

## Shared audio storage and retention

Postgres stores the winning MP3 as base64 in the private artifact result so a
second replica can read it without running the provider again. The MP3 is capped
at 8 MiB and the coordinator JSON result at 12 MiB. Base64 adds about one third to
raw byte size; WAL, replicas and backups add further storage cost. A local atomic
file cache duplicates these bytes for playback speed and is optional. Local disk
failure cannot discard the committed shared result. Public and private audio
remain separate artifact kinds and delivery namespaces.

Ready artifacts currently retain the existing persistent-cache policy: there is
no automatic expiry. Text and draft results are also retained until their account
is deleted; an audio artifact is attached to its generating account. Account
deletion cascades shared coordinator records. Local cache files have the existing
operator-managed disk lifecycle and do not acquire an account-based expiry.
Operators must budget and monitor DB/disk/backup growth before enabling this on a
managed installation; this change does not claim a fixed total storage bound.

Hourly retention removes up to 1000 abandoned pending leases older than one day,
up to 1000 failed records older than seven days and up to 1000 old admission
windows per run. Deleting an expired
lease cannot authorize its old token. Active admission queries use the partial
family/expiry index, excluding stale leases by a clock captured after admission
serialization. Shared lookup and admission add DB reads and short family-wide
serialization; they are not free and do not constitute a throughput benchmark.

## Installation and managed rollout

Public fresh installations apply migration 376 after the existing baseline and
subsequent migrations. The app requires all three new RPCs; missing schema fails
closed with 503. Keep public/private TTS cache key formats and existing filesystem
paths during an upgrade. Historical text-cache records are left untouched for
rollback; rolling back the app can expose its previous stale-row behavior.

A managed release requires a separately reviewed forward equivalent of migration
376, updated schema/postflight qualification, storage/backup capacity assessment,
consistent safety configuration on all replicas, qualification of gateway/RPC
payload limits for base64 audio (up to 12 MiB), and owner release authorization.
The public numbered migration is not a managed upgrade command. No managed
resources or credentials are needed for the regression tests.

Migration 378 adds an optional bounded housekeeping function behind a dedicated
NOLOGIN role and removes implicit PUBLIC execution from the seven legacy RPC
signatures that remained callable by unrelated login roles. Existing anon,
authenticated and service-role callers retain explicit grants. This proves the
database role matrix used by the application; it is not an inventory of every
external SQL client, which must be reviewed separately before managed rollout.
The function's
`system_identifier` argument rejects an accidental connection to a different
PostgreSQL cluster, but it is not a physical-clone identity: a restored or cloned
data directory retains that identifier. Managed execution must therefore also
pin the expected host, endpoint and network path, keep the service credential
outside the application, and verify those gates before invoking the function.
