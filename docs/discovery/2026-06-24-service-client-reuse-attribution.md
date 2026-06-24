# Service Client Reuse Attribution

Date: 2026-06-24  
Issue: [#40](https://github.com/vbalashi/2000nl/issues/40)

## Question

After the body-group SQL fix, warm search is stable but occasional
first-after-idle HTTP/RPC outliers remain. The next hypothesis was that platform
routes recreate the Supabase service client per request, adding avoidable
PostgREST/fetch/client setup churn.

## Finding

`getCatalogSupabase`, `getPlatformServiceSupabase`, and the connected-client
principal service lookup each created a new service-role Supabase client for
every call.

One-off local attribution against the same public grouped-search RPC showed:

```text
new-client first call: 1038.2 ms
reused-client immediately after: 169.3 ms
direct-fetch immediately after: 171.3 ms
```

Running the reused client first in a fresh process showed the first process call
can still be cold, but it was materially smaller in that sample:

```text
reused-client first call: 288.5 ms
new-client immediately after: 105.3 ms
direct-fetch immediately after: 86.3 ms
```

An idle reuse check did not reproduce a second-level spike:

```text
initial: 172.8 ms
warm-1: 65.8 ms
after-30s-idle: 89.8 ms
after-30s-warm: 76.7 ms
```

## Change

Cache the service-role Supabase client at module scope for server-side service
paths, keyed by Supabase URL and service key. Authenticated bearer-token clients
remain per request because their authorization header is request-specific.

The cache is disabled under `NODE_ENV=test` so route unit tests keep isolated
mock behavior.

## Conclusion

This is a low-risk cleanup and should reduce avoidable per-request churn. It
does not prove that all remaining first-after-idle outliers are fixed. If
seconds-level spikes continue after deploy, #40 should continue with deeper
PostgREST/pooler/runtime attribution or a direct pooled PostgreSQL server-only
catalog path.
