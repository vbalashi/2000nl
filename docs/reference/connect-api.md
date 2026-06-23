# 2000NL Connect API

2000NL Connect lets a registered Connected Client obtain a Connected Client
Session for a 2000NL user. The public token contract is opaque: clients must use
the returned `access_token` as a Bearer token and refresh only through 2000NL.
2000NL stores only server-side token hashes and resolves the Connected Client
principal from the presented access token on Platform API requests.

## Connected Client Registration

MVP registration is manual. Insert a row into `connected_clients` with exact
redirect URIs and allowed scopes.

Example for AudioFilms Chrome extension:

```sql
insert into connected_clients (
  client_id,
  display_name,
  client_type,
  allowed_redirect_uris,
  allowed_origins,
  allowed_scopes,
  requires_pkce
) values (
  'audiofilms_chrome',
  'AudioFilms',
  'chrome_extension',
  array['https://<extension-id>.chromiumapp.org/'],
  array['chrome-extension://<extension-id>'],
  array['platform:read', 'platform:write', 'offline_access'],
  true
);
```

For unpacked development builds, keep the Chrome extension ID stable or register
a separate dev client such as `audiofilms_chrome_dev`.

## Authorization Request

Open this URL with `chrome.identity.launchWebAuthFlow` or a regular browser
redirect:

```text
GET /connect/authorize
  ?client_id=audiofilms_chrome
  &redirect_uri=https%3A%2F%2F<extension-id>.chromiumapp.org%2F
  &response_type=code
  &scope=platform%3Aread%20platform%3Awrite%20offline_access
  &state=<client-state>
  &code_challenge=<base64url-sha256-code-verifier>
  &code_challenge_method=S256
```

If the user is not logged in, 2000NL shows the existing login flow and then
returns to the consent screen. After approval, 2000NL redirects to:

```text
https://<extension-id>.chromiumapp.org/?code=<authorization-code>&state=<client-state>
```

The authorization code is one-time use and expires after 5 minutes.

## Token Exchange

```http
POST /api/connect/token
Content-Type: application/json
Origin: chrome-extension://<extension-id>
```

```json
{
  "grant_type": "authorization_code",
  "client_id": "audiofilms_chrome",
  "code": "<authorization-code>",
  "redirect_uri": "https://<extension-id>.chromiumapp.org/",
  "code_verifier": "<original-code-verifier>"
}
```

Response:

```json
{
  "access_token": "<bearer-token>",
  "refresh_token": "<refresh-token>",
  "expires_at": 1781620000,
  "expires_in": 3600,
  "token_type": "bearer",
  "scope": "platform:read platform:write offline_access",
  "user": {
    "id": "<user-id>",
    "email": "user@example.com"
  }
}
```

Store both tokens in extension storage. Treat token values as opaque.

The access token is bound server-side to the Connected Client Session that
issued it. Platform API routes derive `client_id`, scopes, and session/grant
status from that binding, not from request JSON, CORS origin, `Referer`, or a
client-provided source context.

Sessions minted before access-token hash binding do not have a trusted
Connected Client actor attached to already-issued short-lived access tokens.
Those tokens expire naturally; clients should refresh or reconnect to obtain a
new access token that can resolve to a Connected Client principal.

## Refresh

```json
{
  "grant_type": "refresh_token",
  "client_id": "audiofilms_chrome",
  "refresh_token": "<current-refresh-token>"
}
```

The response has the same shape as token exchange. Refresh tokens rotate; replace
the stored refresh token with the new value from every successful refresh.

Refresh works across browser restarts and extension updates as long as the
extension ID, `client_id`, redirect URI, and extension storage survive.

## Revoke Current Session

```json
{
  "client_id": "audiofilms_chrome",
  "refresh_token": "<current-refresh-token>"
}
```

Send this to `POST /api/connect/revoke`. Revocation blocks future refreshes for
that Connected Client Session and Platform API requests reject the bound access
token as soon as the session or grant is marked revoked. Disabled clients cannot
mint new sessions and their bound Platform API requests are rejected.

## Platform API Use

Call AudioFilms `/api/dict*` with:

```http
Authorization: Bearer <access_token>
```

AudioFilms should forward the same Bearer token to 2000NL
`/api/platform/v1/*`.

Connected Client scope enforcement:

- `platform:read` allows read-oriented Platform endpoints such as lookup,
  session, and analyze-selection.
- `platform:write` allows Platform mutation endpoints such as actions and
  translation artifact writes.
- `offline_access` controls refresh-token issuance only. It does not imply
  Platform read or write access.

## CORS

Set `CONNECT_API_ALLOWED_ORIGINS` to the Chrome extension origin or website
origin. If unset, Connect routes fall back to `PLATFORM_API_ALLOWED_ORIGINS`.
