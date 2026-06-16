# Connected Client Session Token Shape

2000NL Connect treats Connected Client Session tokens as opaque 2000NL bearer tokens in the public contract, while the MVP issues Supabase-compatible user tokens so existing `/api/platform/v1/*` routes and SQL RPC authorization continue to run with the caller's `auth.uid()` context. A custom 2000NL JWT format would require a separate platform-token resolver and DB authorization strategy, so it is deferred until there is a concrete need to decouple external sessions from Supabase token semantics.
