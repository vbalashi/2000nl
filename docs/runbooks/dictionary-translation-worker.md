# Dictionary translation worker (#674)

Queue execution is off by default. The release must enable migration 223 through the exact-checksum/postflight DB manifest before setting `DICTIONARY_TRANSLATION_JOBS_ENABLED=true` in the NUC environment. Do not set the flag against contract 222 production. Semantic partitions are deferred by the owner; this worker retains the released full-context prompt and budgets.

`scripts/start-translation-worker.mjs` reads resolved Compose configuration in memory without logging secrets. When enabled it starts the `translation-jobs` profile's worker from the same immutable `UI_IMAGE_TAG` as UI, waits for container health, then the deploy workflow switches UI and checks deep health. When disabled it stops the worker. The worker uses the same server-side provider/Supabase configuration and a read-only audio mount.

The worker validates provider configuration at startup. Successful queue claims (including idle claims) and fenced lease renewals atomically update a shared-volume heartbeat containing only release commit and timestamp. Deep health requires a heartbeat no older than 60s from the same commit when jobs are enabled. A process timer alone cannot keep a disconnected worker healthy. No worker HTTP port or Docker socket is exposed to UI.

SIGTERM stops new claims and drains active jobs. Compose allows 270s, covering the 240s operation deadline and bounded DB calls. A forced exit leaves expiring leases; a replacement claims recovery work and old tokens cannot publish. Two process slots allow a foreground job to start beside speculative work; global DB concurrency remains capped at two across all processes.

The deployment error trap restores worker and UI together. If no previous worker existed, it stops the new worker and overrides the flag to false for the previous UI image. Forward DB migrations stay applied. A failed worker restore is reported as deployment failure and requires operator attention; do not advertise success or bypass a migration hold.

Local validation uses the local Supabase wrapper and dev login. A delayed local test provider can verify enqueue → pending → independent execution → ready without consuming paid tokens; it does not evaluate translation quality. Keep test provider responses and test artifacts out of production. Browser cancellation ends observation only. Automatic polling never forces a failed-job retry; only explicit retry does, subject to the DB cooldown.

The browser buffer reads only frozen, still-available future session members, deduplicates entry IDs, enqueues sequentially at background priority and caps its window at three entries. Lead depth uses recent observed preparation duration and time between cards. At most one background lease may run globally, reserving the other slot for a visible-card request. Speculation never consumes, marks unavailable, grades or changes frozen examples; the authoritative foreground loader revalidates its card.
