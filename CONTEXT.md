# 2000NL Context

This context defines product-specific language for 2000NL learning, platform,
and external integration work.

## Language

**Connected Client**:
A registered external application that a 2000NL user can grant access to through 2000NL Connect.
_Avoid_: extension, companion app, OAuth app, third-party app

**Connected Client Session**:
A 2000NL-issued session for a specific user and Connected Client, represented to the client by an access token, refresh token, expiry, and user summary.
_Avoid_: extension session, Supabase session, app token

**Connected Client Grant**:
A user's permission for a Connected Client to use selected 2000NL access scopes on that user's behalf.
_Avoid_: consent, authorization, permission record

**Connected Client Scope**:
A named access boundary that can be granted to a Connected Client, such as reading platform data, updating learning progress, or staying connected offline.
_Avoid_: role, entitlement, feature flag

**2000NL Connect**:
The authorization flow where a 2000NL user grants a Connected Client access and receives a Connected Client Session.
_Avoid_: extension login, OAuth, Supabase login
