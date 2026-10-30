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
