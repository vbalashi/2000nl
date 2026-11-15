# Connected client catalog reads

These read-only Platform v1 endpoints require a user-bound bearer token and `platform:read`. They reuse authenticated RPC gates without an admin client. No learning or collection state is written. Existing first-party Library routes retain their contracts.

- `GET /api/platform/v1/dictionaries?languageCode=nl`: `{dictionaries:[{id,name,languageCode,kind,visibility,entryCount}]}`. Accessible nonempty dictionary sources. Kind and visibility are independent fields.
- `GET /api/platform/v1/collections?languageCode=nl&query=&limit=50&cursor=...`: `{revision,collections,nextCursor}`, using the personal catalog response. Initial contract is **owned collections only**. Cursor is JSON encoded as a query parameter. Limit 1–100. Language filtering happens in the existing RPC.
- `GET /api/platform/v1/collections/{collectionId}/entries?query=&page=1&pageSize=25`: `{collection:{id,name,description,revision},items:[{id,dictionaryId,languageCode,headword,meaningId,partOfSpeech,content}],total,page,pageSize,hasMore,isLocked,maxAllowed}`. Page size 1–50. Query matches headwords. Content uses the normalized V1 contract; raw database payloads are not returned. The original dictionaryId remains the source identity.

Received collections return 404 in this initial contract; shared reads require separate access qualification. Collection access/revision is checked before and after preparation; changes return 409. Dictionary access is enforced in the entry RPC. Backend/contract failures never become empty successful lists. Unknown or repeated query keys, invalid cursors/UUIDs and unbounded inputs are rejected. Responses are no-store with normal Platform CORS headers.

No database migration is required. Before promotion, qualify the real authenticated RPCs with the intended database, pagination, restricted dictionary access and revoked access. Managed release and client registration remain operational prerequisites; publishing this code does not deploy it.

`GET /api/platform/v1/entries/{entryId}` reads one exact authorized entry and returns `{item:{entry:{id,dictionaryId,languageCode,headword,meaningId,partOfSpeech,content},dictionary}}`. This avoids resolving search results again through the bounded spelling lookup. It uses the existing gated entry RPC and revalidates content/source identity before replying. No query parameters are accepted.
