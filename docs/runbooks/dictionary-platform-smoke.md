# Dictionary Platform Smoke

Use this runbook when checking 2000NL dictionary lookup/search directly or
through the AudioFilms proxy. It keeps token names explicit and avoids printing
secret values.

## Token Map

| Runtime | Variable | Purpose |
| --- | --- | --- |
| 2000NL | `PLATFORM_CATALOG_ACCESS_TOKEN` | Read-only guest catalog lookup/search against `/api/platform/v1/catalog/*`. |
| AudioFilms | `DICTIONARY_2000NL_CATALOG_ACCESS_TOKEN` | Same secret as `PLATFORM_CATALOG_ACCESS_TOKEN`, renamed for the AudioFilms runtime. |
| AudioFilms | `DICTIONARY_2000NL_ACCESS_TOKEN` | Short-lived non-production dogfood fallback only. Do not use for production guest lookup. |

Production ownership:

- 2000NL host env: `PLATFORM_CATALOG_ACCESS_TOKEN`
- AudioFilms host env: `DICTIONARY_2000NL_CATALOG_ACCESS_TOKEN`
- 1Password item: `2000nl web`, concealed field `PLATFORM_CATALOG_ACCESS_TOKEN`

## Direct 2000NL Catalog Smoke

Run from `/Users/khrustal/dev/2000nl`. The command loads local env files if
present, fails clearly when the catalog token is missing, and prints timing plus
`Server-Timing` without printing the token.

```bash
set -a
[ -f .env.local ] && . ./.env.local
[ -f apps/ui/.env.local ] && . ./apps/ui/.env.local
set +a
: "${PLATFORM_CATALOG_ACCESS_TOKEN:?missing PLATFORM_CATALOG_ACCESS_TOKEN}"

for endpoint in catalog/lookup catalog/search; do
  tmp="$(mktemp)"
  headers="$(mktemp)"
  curl -sS -o "$tmp" -D "$headers" \
    -w "$endpoint status=%{http_code} total=%{time_total} starttransfer=%{time_starttransfer}\n" \
    -X POST "https://2000.dilum.io/api/platform/v1/$endpoint" \
    -H "content-type: application/json" \
    -H "authorization: Bearer $PLATFORM_CATALOG_ACCESS_TOKEN" \
    --data '{"query":"ontdekken","languageCode":"nl","intent":"external-click","limit":6}'
  awk 'BEGIN{IGNORECASE=1} /^server-timing:/ {sub(/^[^:]+:[[:space:]]*/, "server-timing: "); print}' "$headers"
  node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); console.log("items/groups:", Array.isArray(j.items) ? j.items.length : Array.isArray(j.groups) ? j.groups.length : "n/a", "error:", j.error || "none")' "$tmp"
  rm -f "$tmp" "$headers"
done
```

Expected healthy result:

- HTTP `200`
- no `error`
- `/catalog/lookup` returns `items`
- `/catalog/search` returns Van Dale-style `groups`
- `Server-Timing` includes `lookup.db` or `search.db`

## AudioFilms Proxy Smoke

AudioFilms uses different request field names from the direct 2000NL Platform
API. Use `clickedForm` and `sourceLanguageCode`, not `word` or `query`.

```bash
for endpoint in lookup search; do
  tmp="$(mktemp)"
  curl -sS -o "$tmp" \
    -w "audiofilms $endpoint status=%{http_code} total=%{time_total} starttransfer=%{time_starttransfer}\n" \
    -X POST "https://audiofilms-api.dilum.io/api/dict/$endpoint" \
    -H "content-type: application/json" \
    --data '{"clickedForm":"ontdekken","sourceLanguageCode":"nl","limit":6}'
  node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); console.log("cards/items/groups:", Array.isArray(j.cards) ? j.cards.length : Array.isArray(j.items) ? j.items.length : Array.isArray(j.groups) ? j.groups.length : "n/a", "error:", j.error || j.code || "none")' "$tmp"
  rm -f "$tmp"
done
```

Expected healthy result:

- HTTP `200`
- no `missing_clicked_form`
- no `guest_lookup_unavailable`
- lookup returns cards/items for known words such as `ontdekken`
- search returns grouped previews

## Local AudioFilms Runtime Check

For local AudioFilms backed by 2000NL catalog lookup, set:

```bash
DICTIONARY_PROVIDER=2000nl
DICTIONARY_2000NL_API_BASE=https://2000.dilum.io/api/platform/v1
DICTIONARY_2000NL_CATALOG_ACCESS_TOKEN=<same value as PLATFORM_CATALOG_ACCESS_TOKEN>
```

Then check `/api/health`. For production-ready guest lookup,
`providers.dictionary.guestLookup.productionReady` should be `true`.
