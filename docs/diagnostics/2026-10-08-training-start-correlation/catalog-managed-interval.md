# DB221 catalog: unprofiled interval and managed metrics

2026-10-08. Production health remained7748355 /0.18.1202 /DB221. Follow-up to [slow profile](./catalog-db221-slow-profile.md).

A bounded six-call transaction-pooler series used the isolated QA identity,
READ ONLY transactions, 10s statement timeout, authenticated role and the
unchanged get_available_word_lists RPC. Auto-explain was disabled locally;
no per-node timing, function tracking or IO timing was enabled by this probe.
The numeric DO wrapper brackets the function with clock_timestamp and emits
only server timestamps, backend PID, elapsed milliseconds and result length.
No learner writes or Training starts. All clients closed and transactions rolled back.

First call: 2950.524ms; repeat 38.191ms. Remaining four calls:
34.007,33.230,33.696,35.178ms. All three clients reused backend3566560;
not three fresh backends. Slow server interval: 18:57:47.158122 through
18:57:50.108646 UTC. The result length was three throughout.

This is independent evidence of a multi-second call without nested profiling
on another backend. It does not quantify instrumentation overhead in the
earlier 3.23s profile or provide a nested plan for this specific 2.95s call.

The hosted Metrics API returned HTTP200 and298 distinct metric names.
Only aggregate CPU modes, load, memory, disk IO time and pooler wait counters
were retained; raw metrics/labels, credentials and SQL content were not saved.
The endpoint supplies database-host context, not per-backend CPU accounting.
Counter deltas across a minute include other workloads; they cannot prove that
this individual request consumed CPU or was throttled.

[Official Metrics API setup](https://supabase.com/docs/guides/observability/metrics/vendor-agnostic)
recommends 60-second scrapes. Two snapshots around the bounded series are
used here, not high-frequency polling. No collector or external service was installed.

GitHub issue413 was observed CLOSED at18:56UTC (closed14:29UTC, no closing
commit in its event). Earlier reports saying it remains open describe their
checkpoint, not current tracker state. The catalog tail is still evidenced;
no issue lifecycle change was made by this probe.

Snapshots: 18:57:46.536–46.747 and18:58:57.624–58.028UTC (about71s
client separation). Aggregate CPU counter changes: idle201.38s, user1.15s,
system0.79s, softirq0.02s, iowait5.10s, steal0.00s. Summed CPU accounting
is208.44s of summed per-CPU core-seconds, not normalized host utilization; do not equate it to single-core request wall time or assume scrape
HTTP timestamps are the exporter observation interval. There is no evidence
of sustained high CPU in this broad accounting window, but a short burst,
exporter refresh/caching and per-request scheduling remain unresolved.
Disk IO time changed4.886s (summed exposed devices, not request IO); pooler
client-wait counter stayed0. Available memory188.9MB to156.6MB, load1 0to0.15.
None of these proves an individual request cause.

Sanitized artifacts are ignored under tmp/latency-audit/managed-interval-*
and copied to the project-local recovery archive.

Next bounded step completed: [own-backend wait sampling](./catalog-backend-waits.md).
